import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { tenantContextStorage } from '../../modules/auth/context/tenant-context-storage.js';

/**
 * OrgParamGuard — exige que el `:orgId` del path coincida con el tenant del request
 * (header `X-Organization-Id`, ya validado por TenantGuard).
 *
 * TenantGuard solo verifica membresía/permisos contra el header; sin este chequeo un
 * admin de la org A podría operar sobre la org B mandando header A y path B.
 *
 * Debe correr DESPUÉS de TenantGuard (que puebla `request.authContext.organizationId`):
 *   @UseGuards(TenantGuard, OrgParamGuard, PermissionsGuard)
 *
 * Sin excepción para superadmin (misma política que planning y metrics). Falla cerrado:
 * si la ruta no tiene `:orgId` o el contexto no trae organización, responde 403.
 * Lee `request.authContext`; el ALS es solo fallback (su propagación a guards no es confiable).
 */
@Injectable()
export class OrgParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authCtx =
      (request['authContext'] as AuthContext | undefined) ?? tenantContextStorage.getStore();
    if (!authCtx?.organizationId) {
      throw new ForbiddenException('Organization context required');
    }
    const params = request['params'] as Record<string, string | undefined> | undefined;
    const orgIdParam = params?.['orgId'];
    if (!orgIdParam || orgIdParam !== authCtx.organizationId) {
      throw new ForbiddenException('TenantMismatch');
    }
    return true;
  }
}
