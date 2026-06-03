import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { tenantContextStorage } from '../context/tenant-context-storage.js';
import { hasPermission, ALL_PERMISSIONS } from '@gestion-publica/shared-types/auth';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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

    // Validate org exists and is active (applies to all users, including superadmins).
    const org = await this.prisma.raw.organization.findUnique({
      where: { id: orgId },
      select: { id: true, status: true },
    });
    if (!org) throw new ForbiddenException('OrganizationNotFound');
    if (org.status !== 'active') throw new ForbiddenException('OrganizationInactive');

    // Superadmin bypass — org is verified above; skip membership check, grant wildcard permissions.
    if (authCtx.isSuperadmin) {
      const enriched: AuthContext = {
        ...authCtx,
        organizationId: orgId,
        permissions: [ALL_PERMISSIONS],
      };
      tenantContextStorage.enterWith(enriched);
      (request as Record<string, unknown>)['authContext'] = enriched;
      return true;
    }

    // Validate membership and load permissions via role → role_permission.
    const membership = await this.prisma.raw.userOrganizationRole.findUnique({
      where: {
        userId_organizationId: {
          userId: authCtx.userId,
          organizationId: orgId,
        },
      },
      include: {
        role: {
          include: {
            rolePermissions: { select: { permissionKey: true } },
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException('TenantMembershipDenied');
    }

    const permissions = membership.role.rolePermissions.map((rp) => rp.permissionKey);

    const enriched: AuthContext = {
      ...authCtx,
      organizationId: orgId,
      permissions,
    };
    tenantContextStorage.enterWith(enriched);
    (request as Record<string, unknown>)['authContext'] = enriched;
    return true;
  }
}

// Re-export for convenience — callers can import hasPermission from this module boundary
// without depending on shared-types directly if needed (optional).
export { hasPermission };
