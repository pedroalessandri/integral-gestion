import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TenantMembershipResolver } from '../services/tenant-membership-resolver.service.js';
import { tenantContextStorage } from '../context/tenant-context-storage.js';
import { hasPermission } from '@gestion-publica/shared-types/auth';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly resolver: TenantMembershipResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> } & Record<string, unknown>>();

    const authCtx =
      (request as Record<string, unknown>)['authContext'] as AuthContext | undefined ??
      tenantContextStorage.getStore();
    if (!authCtx) {
      throw new ForbiddenException('TenantMembershipDenied');
    }

    const orgId = request.headers['x-organization-id'];
    if (!orgId) throw new BadRequestException('MissingTenantHeader');

    // Org activa, membresía (o bypass de superadmin) y permisos: la lógica vive en TenantMembershipResolver.
    const enriched = await this.resolver.resolve(authCtx, orgId, { allowSuperadminBypass: true });
    tenantContextStorage.enterWith(enriched);
    (request as Record<string, unknown>)['authContext'] = enriched;
    return true;
  }
}

// Re-export for convenience — callers can import hasPermission from this module boundary
// without depending on shared-types directly if needed (optional).
export { hasPermission };
