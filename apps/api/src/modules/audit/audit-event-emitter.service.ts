import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '@gestion-publica/shared-types/audit';
import { transactionContextStorage, NoActiveTransactionError } from './context/transaction-context-storage.js';
import { requestContextStorage } from './context/request-context-storage.js';
import { tenantContextStorage } from '../auth/context/tenant-context-storage.js';
import { MissingRequestContextError, MissingActorError } from './errors.js';

@Injectable()
export class AuditEventEmitterService {
  private readonly logger = new Logger(AuditEventEmitterService.name);

  async emit(event: DomainEvent): Promise<void> {
    const tx = transactionContextStorage.getStore();
    if (!tx) throw new NoActiveTransactionError(AuditEventEmitterService.name);

    const reqCtx = requestContextStorage.getStore();
    if (!reqCtx) throw new MissingRequestContextError();

    // TODO(ADR-0004): TenantContextStorage will be populated by AuthGuard once auth module lands.
    // During development (NODE_ENV !== 'production'), DevAuthMiddleware populates it instead.
    const tenantCtx = tenantContextStorage.getStore();
    if (!tenantCtx?.userId) throw new MissingActorError();

    const organizationId = tenantCtx.organizationId ?? null;

    await tx.auditEvent.create({
      data: {
        actorId: tenantCtx.userId,
        organizationId,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        diff: event.diff as object,
        requestId: reqCtx.requestId,
      },
    });

    this.logger.debug(
      `Audit event emitted: ${event.action} on ${event.entityType}:${event.entityId}`,
    );
  }
}
