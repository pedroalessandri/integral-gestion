import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
  type ProjectCompletedEvent,
  type ProjectReopenedEvent,
} from '@gestion-publica/shared-types/okr';
import { ProjectContributionApplier } from '../services/project-contribution-applier.service.js';

/**
 * Oyentes de `project.completed` / `project.reopened` (ADR-0009 D5, `okr` -> `metrics`): efecto post-commit que aplica
 * o compensa los aportes del proyecto a sus indicadores (RN-P13). Toda la lógica está en
 * `ProjectContributionApplier`, que reconcilia contra el estado actual del proyecto: idempotente, y escribe su propio
 * audit en su propia transacción. Los dos eventos disparan la misma reconciliación; el evento solo aporta el
 * contexto (organización, actor, request) y la fecha del hecho.
 */
@Injectable()
export class ProjectLifecycleListener {
  constructor(private readonly applier: ProjectContributionApplier) {}

  @OnEvent(PROJECT_COMPLETED)
  async onCompleted(event: ProjectCompletedEvent): Promise<void> {
    await this.reconcile(event);
  }

  @OnEvent(PROJECT_REOPENED)
  async onReopened(event: ProjectReopenedEvent): Promise<void> {
    await this.reconcile(event);
  }

  private async reconcile(event: ProjectCompletedEvent | ProjectReopenedEvent): Promise<void> {
    await this.applier.reconcileProject({
      organizationId: event.organizationId,
      actorId: event.actorId,
      requestId: event.requestId,
      projectId: event.projectId,
      projectTitle: event.projectTitle,
      occurredAt: new Date(event.occurredAt),
    });
  }
}
