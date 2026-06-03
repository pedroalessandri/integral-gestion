import { Injectable, NotFoundException } from '@nestjs/common';
import type { MeDto } from '@gestion-publica/shared-types/core';
import { PrismaService } from '../../auth/prisma/prisma.service.js';

/**
 * MeService — returns the authenticated user's profile and all org memberships.
 *
 * Uses prismaService.raw (bypass tenant extension) because /me must return
 * memberships across ALL orgs, not just the current org context.
 *
 * Per ADR 0002 D6 (bypass multi-org queries via raw client).
 * Per ADR 0004: role.key = role.name = membership.roleId and role.permissions = []
 *   TODO(ADR-0004): resolve real role key + permissions via auth.role join.
 */
@Injectable()
export class MeService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Returns the full /me response for the given userId.
   * Throws NotFoundException if the user doesn't exist.
   */
  async getMe(userId: string): Promise<MeDto> {
    // Use raw client to bypass tenant scoping — /me is cross-org by design
    const user = await this.prismaService.raw.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    let orgs: MeDto['orgs'];

    if (user.isSuperadmin) {
      // Superadmin path: return ALL active organizations regardless of membership
      const allActiveOrgs = await this.prismaService.raw.organization.findMany({
        where: { status: 'active' },
      });

      orgs = await Promise.all(
        allActiveOrgs.map(async (org) => {
          const enabledModules = await this.prismaService.raw.organizationModule.findMany({
            where: {
              organizationId: org.id,
              disabledAt: null,
            },
            select: { moduleKey: true },
          });

          return {
            id: org.id,
            slug: org.slug,
            name: org.name,
            role: {
              // superadmin sentinel — user is not a member of the org but has cross-tenant access
              key: 'superadmin',
              name: 'superadmin',
              permissions: ['*'],
            },
            enabledModules: enabledModules.map((em) => em.moduleKey),
          };
        }),
      );
    } else {
      // Load all memberships for this user across all orgs
      const memberships = await this.prismaService.raw.userOrganizationRole.findMany({
        where: { userId },
        include: {
          organization: true,
        },
      });

      orgs = await Promise.all(
        memberships.map(async (m) => {
          // Load enabled modules for this org
          const enabledModules = await this.prismaService.raw.organizationModule.findMany({
            where: {
              organizationId: m.organizationId,
              disabledAt: null,
            },
            select: { moduleKey: true },
          });

          return {
            id: m.organization.id,
            slug: m.organization.slug,
            name: m.organization.name,
            role: {
              // TODO(ADR-0004): resolve real role key + permissions via auth.role join
              // For now, return roleId as key and name with empty permissions
              key: m.roleId,
              name: m.roleId,
              permissions: [],
            },
            enabledModules: enabledModules.map((em) => em.moduleKey),
          };
        }),
      );
    }

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      isSuperadmin: user.isSuperadmin,
      orgs,
    };
  }
}
