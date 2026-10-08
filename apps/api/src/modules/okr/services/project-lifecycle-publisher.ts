import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
  type ProjectCompletedEvent,
  type ProjectReopenedEvent,
} from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { requestContextStorage } from '../../audit/index.js';

/** Máximo avance de un proyecto: 100 % en basis points. */
export const PROJECT_COMPLETE_BP = 10000;

/** Cambio de avance de un proyecto dentro de una transacción (antes -> después del recálculo). */
export interface ProjectProgressTransition {
  projectId: string;
  projectTitle: string;
  objectiveId: string;
  fromBp: number;
  toBp: number;
}

type Actor = Pick<AuthContext, 'userId' | 'requestId'>;

/**
 * Publica `project.completed` / `project.reopened` (ADR-0009 D5, `okr` -> `metrics`) DESPUÉS del commit. Nunca se
 * llama dentro de la transacción: el llamador junta las transiciones y publica cuando `runInTransaction` volvió.
 *
 * `emitAsync` espera al oyente de `metrics`; si falla, el cambio de `okr` ya está confirmado: se loguea y no se
 * revierte (consistencia eventual; repetir el evento o cualquier cambio posterior del proyecto lo reconcilia).
 */
@Injectable()
export class ProjectLifecyclePublisher {
  private readonly logger = new Logger(ProjectLifecyclePublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /** Llega al 100 % -> `project.completed`; deja de estar al 100 % -> `project.reopened`. Otros cambios no emiten. */
  async publishTransitions(
    organizationId: string,
    actor: Actor,
    transitions: ReadonlyArray<ProjectProgressTransition>,
    now: Date = new Date(),
  ): Promise<void> {
    for (const t of transitions) {
      const wasComplete = t.fromBp === PROJECT_COMPLETE_BP;
      const isComplete = t.toBp === PROJECT_COMPLETE_BP;
      if (!wasComplete && isComplete) {
        await this.emit(PROJECT_COMPLETED, this.base(organizationId, actor, t, now));
      } else if (wasComplete && !isComplete) {
        const event: ProjectReopenedEvent = { ...this.base(organizationId, actor, t, now), reason: 'progress_dropped' };
        await this.emit(PROJECT_REOPENED, event);
      }
    }
  }

  /** El proyecto se borró: si tenía aportes aplicados, `metrics` los compensa y los da de baja. */
  async publishDeleted(
    organizationId: string,
    actor: Actor,
    project: { id: string; title: string; objectiveId: string },
    now: Date = new Date(),
  ): Promise<void> {
    const event: ProjectReopenedEvent = {
      ...this.base(
        organizationId,
        actor,
        { projectId: project.id, projectTitle: project.title, objectiveId: project.objectiveId },
        now,
      ),
      reason: 'deleted',
    };
    await this.emit(PROJECT_REOPENED, event);
  }

  private base(
    organizationId: string,
    actor: Actor,
    project: { projectId: string; projectTitle: string; objectiveId: string },
    now: Date,
  ): ProjectCompletedEvent {
    return {
      organizationId,
      actorId: actor.userId,
      // El request real (middleware / interceptor) manda; el del AuthContext es el respaldo.
      requestId: requestContextStorage.getStore()?.requestId ?? actor.requestId,
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      objectiveId: project.objectiveId,
      occurredAt: now.toISOString(),
    };
  }

  private async emit(name: string, payload: ProjectCompletedEvent | ProjectReopenedEvent): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(name, payload);
    } catch (error) {
      this.logger.error(`El oyente de ${name} falló para el proyecto ${payload.projectId}: ${String(error)}`);
    }
  }
}
