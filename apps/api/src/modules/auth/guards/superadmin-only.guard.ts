import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { tenantContextStorage } from '../context/tenant-context-storage.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * Restricts an endpoint to superadmins.
 *
 * Reads the AuthContext from the request object first (written by
 * AuthGuard/TenantGuard/DevAuthMiddleware), with a fallback to the ALS store —
 * the same pattern as @CurrentUser and the other guards. The ALS store may
 * still hold the pre-TenantGuard context by the time a guard runs, so reading
 * from the request is required to avoid rejecting legitimate superadmins.
 */
@Injectable()
export class SuperadminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authCtx =
      (request['authContext'] as AuthContext | undefined) ??
      tenantContextStorage.getStore();
    if (!authCtx?.isSuperadmin) throw new ForbiddenException('SuperadminRequired');
    return true;
  }
}
