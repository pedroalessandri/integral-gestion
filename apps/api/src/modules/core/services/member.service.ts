import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { MemberDto } from '@gestion-publica/shared-types/core';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ORG_UNIT_SCOPE, type OrgUnitScope } from '../../../common/contracts/index.js';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/audit-event-emitter.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

export interface AssignMemberInput {
  userIdOrEmail: string;
  roleId: string;
}

export interface UpdateMemberInput {
  roleId: string;
}

const INVITABLE_ROLE_KEYS = ['org-admin', 'org-user', 'org-reader'] as const;
type InvitableRoleKey = (typeof INVITABLE_ROLE_KEYS)[number];

function isInvitableRole(key: string): key is InvitableRoleKey {
  return (INVITABLE_ROLE_KEYS as readonly string[]).includes(key);
}

/**
 * MemberService — manages UserOrganizationRole memberships.
 *
 * Supports:
 *  - list: returns members with role info and isPending flag.
 *  - inviteByEmail: upserts user by email (pending placeholder if new) and assigns role atomically.
 *  - changeRole: changes an existing member's role.
 *  - assign: legacy — assigns role to a user that must already exist.
 *  - update: legacy — updates role via roleId (internal id).
 *  - remove: removes a member from an organization.
 */
@Injectable()
export class MemberService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

  /**
   * Lists members of an organization.
   * Supports optional roleKey filter (by role.key) and search (email/displayName).
   * Returns isPending=true when user's auth0Sub starts with "pending:".
   */
  async list(
    organizationId: string,
    options: { roleKey?: string; roleId?: string; search?: string } = {},
  ): Promise<MemberDto[]> {
    const memberships = await this.prismaService.raw.userOrganizationRole.findMany({
      where: {
        organizationId,
        ...(options.roleId && { roleId: options.roleId }),
        ...(options.roleKey && {
          role: { key: options.roleKey },
        }),
      },
      include: {
        user: true,
        role: true,
      },
    });

    return memberships
      .filter((m) => {
        if (!options.search) return true;
        const s = options.search.toLowerCase();
        return (
          m.user.email.toLowerCase().includes(s) ||
          m.user.displayName.toLowerCase().includes(s)
        );
      })
      .map((m) => this.toMemberDto(m, m.user, m.role));
  }

  /**
   * Invites a user by email. If the user does not exist in core.user, creates a
   * placeholder record (auth0Sub = "pending:<email>") so they can be assigned a role
   * before they have ever logged in. When they log in via Auth0, UserSyncService will
   * update their auth0Sub to the real value.
   *
   * Throws:
   *  - 400 InvalidRole — if roleKey is not one of the invitable roles.
   *  - 409 MemberAlreadyExists — if user already has a role in this org.
   */
  async inviteByEmail(
    authContext: AuthContext,
    organizationId: string,
    input: { email: string; roleKey: string; orgUnitId?: string | null },
  ): Promise<MemberDto> {
    if (!isInvitableRole(input.roleKey)) {
      throw new BadRequestException(
        `InvalidRole: "${input.roleKey}" is not a valid invitable role. Must be one of: ${INVITABLE_ROLE_KEYS.join(', ')}.`,
      );
    }

    // Resolve the auth.role record by key.
    const role = await this.prismaService.raw.role.findUnique({
      where: { key: input.roleKey },
    });
    if (!role) {
      throw new BadRequestException(
        `InvalidRole: role key "${input.roleKey}" not found in the role catalog.`,
      );
    }

    // Alcance del miembro nuevo: `orgUnitId` opcional; sin él queda en null (toda la org, comportamiento histórico).
    const orgUnitId = input.orgUnitId ?? null;
    await this.assertCanGrantScope(authContext, orgUnitId);
    if (orgUnitId !== null) await this.assertUnitInOrg(organizationId, orgUnitId);

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        // Upsert user by email.
        let user = await tx.user.findUnique({ where: { email: input.email } });
        if (!user) {
          user = await tx.user.create({
            data: {
              auth0Sub: `pending:${input.email}`,
              email: input.email,
              displayName: input.email,
              isSuperadmin: false,
            },
          });
        }

        // Check if already a member.
        const existing = await tx.userOrganizationRole.findUnique({
          where: {
            userId_organizationId: { userId: user.id, organizationId },
          },
          include: { role: true },
        });
        if (existing) {
          throw new ConflictException(
            `MemberAlreadyExists: User "${input.email}" is already a member of this organization with role "${existing.role.key}".`,
          );
        }

        // Create membership.
        const membership = await tx.userOrganizationRole.create({
          data: {
            userId: user.id,
            organizationId,
            roleId: role.id,
            assignedByUserId: authContext.userId,
            orgUnitId,
          },
          include: { user: true, role: true },
        });

        await this.auditEmitter.emit({
          action: 'user_organization_role.assigned',
          entityType: 'core.user_organization_role',
          entityId: `${user.id}:${organizationId}`,
          diff: {
            before: null,
            after: { roleId: role.id, roleKey: role.key, orgUnitId },
          },
        });

        return this.toMemberDto(membership, membership.user, membership.role);
      }),
    );
  }

  /**
   * Un actor con alcance en una unidad no puede dar un alcance mayor al suyo (escalada de privilegios):
   * otorgar `null` (toda la org) exige alcance central; otorgar una unidad exige poder escribir en ella.
   */
  private async assertCanGrantScope(authContext: AuthContext, orgUnitId: string | null): Promise<void> {
    if (orgUnitId === null) await this.orgUnitScope.assertCentralScope(authContext);
    else await this.orgUnitScope.assertCanWriteInUnit(authContext, orgUnitId);
  }

  private async assertUnitInOrg(organizationId: string, orgUnitId: string): Promise<void> {
    const unit = await this.prismaService.raw.orgUnit.findFirst({
      where: { id: orgUnitId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException(`OrgUnit "${orgUnitId}" not found in this organization.`);
    }
  }

  /**
   * Changes the role of an existing member.
   *
   * Throws:
   *  - 400 InvalidRole — if roleKey is not one of the invitable roles.
   *  - 404 NotMember — if user is not a member of this org.
   *
   * Returns the updated member DTO. If roleKey equals the current role, returns current state (no-op).
   */
  async changeRole(
    authContext: AuthContext,
    organizationId: string,
    userId: string,
    newRoleKey: string,
  ): Promise<MemberDto & { changed: boolean }> {
    if (!isInvitableRole(newRoleKey)) {
      throw new BadRequestException(
        `InvalidRole: "${newRoleKey}" is not a valid role. Must be one of: ${INVITABLE_ROLE_KEYS.join(', ')}.`,
      );
    }

    const existing = await this.prismaService.raw.userOrganizationRole.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { user: true, role: true },
    });
    if (!existing) {
      throw new NotFoundException(`NotMember: User "${userId}" is not a member of this organization.`);
    }

    // No-op if same role.
    if (existing.role.key === newRoleKey) {
      return { ...this.toMemberDto(existing, existing.user, existing.role), changed: false };
    }

    const newRole = await this.prismaService.raw.role.findUnique({
      where: { key: newRoleKey },
    });
    if (!newRole) {
      throw new BadRequestException(
        `InvalidRole: role key "${newRoleKey}" not found in the role catalog.`,
      );
    }

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.userOrganizationRole.update({
          where: { userId_organizationId: { userId, organizationId } },
          data: { roleId: newRole.id },
          include: { user: true, role: true },
        });

        await this.auditEmitter.emit({
          action: 'user_organization_role.role_changed',
          entityType: 'core.user_organization_role',
          entityId: `${userId}:${organizationId}`,
          diff: {
            before: { roleId: existing.role.id, roleKey: existing.role.key },
            after: { roleId: newRole.id, roleKey: newRole.key },
          },
        });

        return { ...this.toMemberDto(updated, updated.user, updated.role), changed: true };
      }),
    );
  }

  /**
   * Assigns a role to a user in an organization (legacy — user must already exist).
   * Throws NotFoundException if user not found.
   * Throws ConflictException if user already has a role in this org.
   */
  async assign(
    organizationId: string,
    input: AssignMemberInput,
    authContext: AuthContext,
  ): Promise<MemberDto> {
    // La membresía nueva queda con alcance null (toda la org): exige alcance central (sin escalada).
    await this.orgUnitScope.assertCentralScope(authContext);
    const user = await this.resolveUser(input.userIdOrEmail);

    const existing = await this.prismaService.raw.userOrganizationRole.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId },
      },
    });
    if (existing) {
      throw new ConflictException(
        `User ${user.email} is already a member of this organization.`,
      );
    }

    // Resolve role by id or key.
    const role = await this.prismaService.raw.role.findFirst({
      where: { OR: [{ id: input.roleId }, { key: input.roleId }] },
    });
    if (!role) {
      throw new NotFoundException(`Role "${input.roleId}" not found.`);
    }

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const membership = await tx.userOrganizationRole.create({
          data: {
            userId: user.id,
            organizationId,
            roleId: role.id,
            assignedByUserId: authContext.userId,
          },
          include: { user: true, role: true },
        });

        await this.auditEmitter.emit({
          action: 'user_organization_role.assigned',
          entityType: 'core.user_organization_role',
          entityId: `${user.id}:${organizationId}`,
          diff: {
            before: null,
            after: { roleId: role.id, roleKey: role.key },
          },
        });

        return this.toMemberDto(membership, membership.user, membership.role);
      }),
    );
  }

  /**
   * Updates a member's role in an organization (legacy — takes roleId).
   */
  async update(
    organizationId: string,
    userId: string,
    input: UpdateMemberInput,
    authContext: AuthContext,
  ): Promise<MemberDto> {
    const existing = await this.prismaService.raw.userOrganizationRole.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { user: true, role: true },
    });
    if (!existing) {
      throw new NotFoundException(`Member ${userId} not found in this organization.`);
    }

    const newRole = await this.prismaService.raw.role.findFirst({
      where: { OR: [{ id: input.roleId }, { key: input.roleId }] },
    });
    if (!newRole) {
      throw new NotFoundException(`Role "${input.roleId}" not found.`);
    }

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.userOrganizationRole.update({
          where: { userId_organizationId: { userId, organizationId } },
          data: { roleId: newRole.id },
          include: { user: true, role: true },
        });

        await this.auditEmitter.emit({
          action: 'user_organization_role.role_changed',
          entityType: 'core.user_organization_role',
          entityId: `${userId}:${organizationId}`,
          diff: {
            before: { roleId: existing.role.id, roleKey: existing.role.key },
            after: { roleId: newRole.id, roleKey: newRole.key },
          },
        });

        return this.toMemberDto(updated, updated.user, updated.role);
      }),
    );
  }

  /**
   * Sets the write scope of a member (RN-P19/P20): an OrgUnit id, or null for the whole org
   * (central unit). The unit must be live and belong to the same organization.
   *
   * Throws:
   *  - 404 NotMember — user is not a member of this org.
   *  - 404 — unit not found in this org (or soft-deleted).
   */
  async setScope(
    authContext: AuthContext,
    organizationId: string,
    userId: string,
    orgUnitId: string | null,
  ): Promise<MemberDto & { changed: boolean }> {
    const existing = await this.prismaService.raw.userOrganizationRole.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { user: true, role: true },
    });
    if (!existing) {
      throw new NotFoundException(`NotMember: User "${userId}" is not a member of this organization.`);
    }

    // Sin escalada: quien reasigna el alcance debe poder otorgar el nuevo y administrar el actual del miembro.
    await this.assertCanGrantScope(authContext, orgUnitId);
    if (existing.orgUnitId === null) await this.orgUnitScope.assertCentralScope(authContext);
    else await this.orgUnitScope.assertCanWriteInUnit(authContext, existing.orgUnitId);

    if (orgUnitId !== null) {
      const unit = await this.prismaService.raw.orgUnit.findFirst({
        where: { id: orgUnitId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!unit) {
        throw new NotFoundException(`OrgUnit "${orgUnitId}" not found in this organization.`);
      }
    }

    if (existing.orgUnitId === orgUnitId) {
      return { ...this.toMemberDto(existing, existing.user, existing.role), changed: false };
    }

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.userOrganizationRole.update({
          where: { userId_organizationId: { userId, organizationId } },
          data: { orgUnitId },
          include: { user: true, role: true },
        });

        await this.auditEmitter.emit({
          action: 'user_organization_role.scope_changed',
          entityType: 'core.user_organization_role',
          entityId: `${userId}:${organizationId}`,
          diff: {
            before: { orgUnitId: existing.orgUnitId },
            after: { orgUnitId },
          },
        });

        return { ...this.toMemberDto(updated, updated.user, updated.role), changed: true };
      }),
    );
  }

  /**
   * Returns true iff the given user has a UserOrganizationRole row for this organization.
   * Superadmins are NOT implicitly members — caller must check explicitly.
   */
  async isMemberOf(organizationId: string, userId: string): Promise<boolean> {
    const row = await this.prismaService.raw.userOrganizationRole.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { userId: true },
    });
    return row !== null;
  }

  /**
   * Removes a member from an organization.
   */
  async remove(
    organizationId: string,
    userId: string,
    authContext: AuthContext,
  ): Promise<void> {
    const existing = await this.prismaService.raw.userOrganizationRole.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { role: true },
    });
    if (!existing) {
      throw new NotFoundException(`Member ${userId} not found in this organization.`);
    }

    await tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        await tx.userOrganizationRole.delete({
          where: { userId_organizationId: { userId, organizationId } },
        });

        await this.auditEmitter.emit({
          action: 'user_organization_role.removed',
          entityType: 'core.user_organization_role',
          entityId: `${userId}:${organizationId}`,
          diff: {
            before: { roleId: existing.roleId },
            after: null,
          },
        });
      }),
    );
  }

  private async resolveUser(
    userIdOrEmail: string,
  ): Promise<{ id: string; email: string; displayName: string }> {
    const byId = await this.prismaService.raw.user.findUnique({
      where: { id: userIdOrEmail },
    });
    if (byId) return byId;

    const byEmail = await this.prismaService.raw.user.findUnique({
      where: { email: userIdOrEmail },
    });
    if (!byEmail) {
      throw new NotFoundException(
        `User "${userIdOrEmail}" not found. The user must log in at least once before being assigned a role.`,
      );
    }
    return byEmail;
  }

  private toMemberDto(
    membership: { assignedAt: Date; orgUnitId?: string | null },
    user: { id: string; email: string; displayName: string; auth0Sub: string },
    role: { id: string; key: string; name: string },
  ): MemberDto {
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: {
        id: role.id,
        key: role.key,
        name: role.name,
      },
      assignedAt: membership.assignedAt.toISOString(),
      isPending: user.auth0Sub.startsWith('pending:'),
      orgUnitId: membership.orgUnitId ?? null,
    };
  }
}
