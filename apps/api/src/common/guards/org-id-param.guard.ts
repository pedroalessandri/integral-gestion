import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { tenantContextStorage } from '../../modules/auth/context/tenant-context-storage.js';

/**
 * OrgIdParamGuard — variante de `OrgParamGuard` para rutas `orgs/:id` donde el `:id` ES la organización.
 *
 * Exige que `:id` coincida con el tenant del request (header `X-Organization-Id`, ya validado por TenantGuard),
 * para que un miembro de la org A no lea ni edite la org B mandando header A y path B. Falla cerrado.
 * Debe correr DESPUÉS de TenantGuard. Lee `request.authContext`; el ALS es solo fallback.
 */
@Injectable()
export class OrgIdParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authCtx =
      (request['authContext'] as AuthContext | undefined) ?? tenantContextStorage.getStore();
    if (!authCtx?.organizationId) {
      throw new ForbiddenException('Organization context required');
    }
    const params = request['params'] as Record<string, string | undefined> | undefined;
    const idParam = params?.['id'];
    if (!idParam || idParam !== authCtx.organizationId) {
      throw new ForbiddenException('TenantMismatch');
    }
    return true;
  }
}
