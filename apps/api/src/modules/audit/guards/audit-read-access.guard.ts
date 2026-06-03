import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { hasPermission } from '@gestion-publica/shared-types/auth';

/**
 * Guards the audit read endpoints per ADR 0003 / ADR 0004.
 *
 * Allows access if the caller is superadmin (isSuperadmin = true) OR holds
 * the 'audit:read' permission in the current AuthContext.
 *
 * AuthGuard (APP_GUARD) runs before this and populates tenantContextStorage;
 * this guard only needs to inspect that context.
 */
@Injectable()
export class AuditReadAccessGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const authCtx = tenantContextStorage.getStore();
    if (!authCtx) throw new ForbiddenException('PermissionDenied');
    if (authCtx.isSuperadmin) return true;
    if (hasPermission(authCtx, 'audit:read')) return true;
    throw new ForbiddenException('PermissionDenied');
  }
}
