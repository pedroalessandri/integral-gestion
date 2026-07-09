import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { hasPermission } from '@gestion-publica/shared-types/auth';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * Guards the audit read endpoints per ADR 0003 / ADR 0004.
 *
 * Allows access if the caller is superadmin (isSuperadmin = true) OR holds
 * the 'audit:read' permission in the current AuthContext.
 *
 * Reads the AuthContext from the request object first (written by
 * AuthGuard/TenantGuard/DevAuthMiddleware), with a fallback to the ALS store —
 * the same pattern as @CurrentUser and the other guards, since the ALS store
 * may still hold the pre-TenantGuard context by the time a guard runs.
 */
@Injectable()
export class AuditReadAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authCtx =
      (request['authContext'] as AuthContext | undefined) ??
      tenantContextStorage.getStore();
    if (!authCtx) throw new ForbiddenException('PermissionDenied');
    if (authCtx.isSuperadmin) return true;
    if (hasPermission(authCtx, 'audit:read')) return true;
    throw new ForbiddenException('PermissionDenied');
  }
}
