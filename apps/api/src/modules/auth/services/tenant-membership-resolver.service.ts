import { ForbiddenException, Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@gestion-publica/shared-types/auth';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ResolveTenantOptions {
  /**
   * `true` (web): un superadmin entra a cualquier org activa con `['*']` y sin alcance de unidad.
   * `false` (conector MCP, ADR-0010 D4): el superadmin opera solo en orgs donde tiene membresía y con el rol de
   * esa membresía; el contexto resultante NO es superadmin.
   */
  allowSuperadminBypass: boolean;
}

/** Membresía del usuario en una organización activa, con lo mínimo para listarla. */
export interface UserMembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  /** Valor crudo de `core.organization.sector` ('public' | 'private' | 'nonprofit'). */
  organizationSector: string;
  roleKey: string;
  roleName: string;
  orgUnitId: string | null;
  orgUnitName: string | null;
}

/**
 * Resuelve (usuario, organización) a un `AuthContext` con `organizationId`, `permissions` y `orgUnitId`.
 *
 * Extraída de `TenantGuard` sin cambio de comportamiento (ADR-0010 D1/D4). Los códigos de error son los mismos:
 * `OrganizationNotFound`, `OrganizationInactive`, `TenantMembershipDenied`.
 */
@Injectable()
export class TenantMembershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    authCtx: AuthContext,
    organizationId: string,
    options: ResolveTenantOptions,
  ): Promise<AuthContext> {
    // La org tiene que existir y estar activa (también para superadmins).
    const org = await this.prisma.raw.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, status: true },
    });
    if (!org) throw new ForbiddenException('OrganizationNotFound');
    if (org.status !== 'active') throw new ForbiddenException('OrganizationInactive');

    if (authCtx.isSuperadmin && options.allowSuperadminBypass) {
      return {
        ...authCtx,
        organizationId,
        permissions: [ALL_PERMISSIONS],
        orgUnitId: null,
      };
    }

    const membership = await this.prisma.raw.userOrganizationRole.findUnique({
      where: { userId_organizationId: { userId: authCtx.userId, organizationId } },
      include: { role: { include: { rolePermissions: { select: { permissionKey: true } } } } },
    });
    if (!membership) throw new ForbiddenException('TenantMembershipDenied');

    return {
      ...authCtx,
      // Sin bypass, el superadmin deja de serlo para los services y para la extensión de tenant.
      isSuperadmin: options.allowSuperadminBypass ? authCtx.isSuperadmin : false,
      organizationId,
      permissions: membership.role.rolePermissions.map((rp) => rp.permissionKey),
      orgUnitId: membership.orgUnitId,
    };
  }

  /** Membresías reales del usuario en organizaciones activas (sin bypass de superadmin). Orden por nombre. */
  async listMemberships(userId: string): Promise<UserMembershipSummary[]> {
    const rows = await this.prisma.raw.userOrganizationRole.findMany({
      where: { userId, organization: { status: 'active' } },
      include: {
        organization: { select: { id: true, name: true, slug: true, sector: true } },
        role: { select: { key: true, name: true } },
        orgUnit: { select: { name: true, deletedAt: true } },
      },
    });
    return rows
      .map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        organizationSector: m.organization.sector,
        roleKey: m.role.key,
        roleName: m.role.name,
        orgUnitId: m.orgUnitId,
        orgUnitName: m.orgUnit && m.orgUnit.deletedAt === null ? m.orgUnit.name : null,
      }))
      .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  }
}
