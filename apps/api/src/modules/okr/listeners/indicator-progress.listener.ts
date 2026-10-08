import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { INDICATOR_PROGRESS_CHANGED } from '@gestion-publica/shared-types/metrics';
import type { IndicatorProgressChangedEvent } from '@gestion-publica/shared-types/metrics';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { AuditEventEmitterService, requestContextStorage } from '../../audit/index.js';
import { lockObjective } from '../services/project-recompute.js';

/**
 * Oyente de `indicator.progress_changed` (ADR-0009 D5, `metrics` -> `okr`): efecto post-commit que deja
 * `Objective.resultProgressCachedBp` con el resultado agregado que calculó `metrics`. Solo la lectura de
 * RESULTADO; la de gestión no se toca nunca.
 *
 * - Idempotente: SETEA el valor del payload; si el objetivo ya lo tiene (o no existe más), no hace nada ni audita.
 * - Escribe su propio audit (`objective.result_progress_changed`) en su propia transacción.
 * - El oyente corre fuera de la transacción original: organización, actor y requestId vienen en el payload y
 *   se reconstruye el contexto de tenant/request a partir de ellos (no depende de que el ALS se propague).
 *
 * TODO(F7): los proyectos `from_indicator` toman su avance del indicador; cuando existan, actualizar acá su
 * `progressCachedBp` (y la gestión del objetivo) a partir de `progressBp` / `objectiveIndicatorId`.
 */
@Injectable()
export class IndicatorProgressListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  @OnEvent(INDICATOR_PROGRESS_CHANGED)
  async handle(event: IndicatorProgressChangedEvent): Promise<void> {
    const actor: AuthContext = {
      userId: event.actorId,
      auth0Sub: '',
      email: '',
      displayName: '',
      isSuperadmin: false,
      organizationId: event.organizationId,
      permissions: [],
      requestId: event.requestId,
    };

    await requestContextStorage.run({ requestId: event.requestId }, () =>
      tenantContextStorage.run(actor, () =>
        this.prisma.runInTransaction(async (tx) => {
          await lockObjective(tx, event.objectiveId, event.organizationId);
          const objective = await tx.objective.findFirst({
            where: { id: event.objectiveId, organizationId: event.organizationId, deletedAt: null },
            select: { resultProgressCachedBp: true },
          });
          if (!objective || objective.resultProgressCachedBp === event.objectiveResultProgressBp) return;

          await tx.objective.updateMany({
            where: { id: event.objectiveId, organizationId: event.organizationId },
            data: { resultProgressCachedBp: event.objectiveResultProgressBp },
          });
          await this.auditEmitter.emit({
            action: 'objective.result_progress_changed',
            entityType: 'okr.objective',
            entityId: event.objectiveId,
            diff: {
              before: { resultProgressCachedBp: objective.resultProgressCachedBp },
              after: { resultProgressCachedBp: event.objectiveResultProgressBp },
            },
          });
        }),
      ),
    );
  }
}
