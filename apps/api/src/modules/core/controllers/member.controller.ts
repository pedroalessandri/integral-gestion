import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { MemberService } from '../services/member.service.js';
import { AssignMemberDto } from '../dto/assign-member.dto.js';
import { UpdateMemberDto } from '../dto/update-member.dto.js';
import { InviteMemberDto } from '../dto/invite-member.dto.js';
import { ChangeMemberRoleDto } from '../dto/change-member-role.dto.js';
import { ListMembersQueryDto } from '../dto/list-members-query.dto.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * MemberController — manages UserOrganizationRole memberships.
 *
 * All endpoints require TenantGuard (org active + membership verified) and
 * PermissionsGuard with 'core:member:manage' (granted to org-admin).
 *
 * Routes:
 *   GET    /api/v1/orgs/:orgId/members              — list members
 *   POST   /api/v1/orgs/:orgId/members/invite        — invite by email (upsert user)
 *   PATCH  /api/v1/orgs/:orgId/members/:userId/role  — change role of existing member
 *   POST   /api/v1/orgs/:orgId/members               — legacy assign (user must exist)
 *   PATCH  /api/v1/orgs/:orgId/members/:userId       — legacy update by roleId
 *   DELETE /api/v1/orgs/:orgId/members/:userId       — remove member
 */
@Controller('orgs/:orgId/members')
@UseGuards(TenantGuard, PermissionsGuard)
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  /**
   * GET /api/v1/orgs/:orgId/members
   * Lists members of an organization.
   * Response shape: { items: MemberDto[] }
   */
  @Get()
  @Permissions('core:member:manage')
  async list(
    @Param('orgId') orgId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListMembersQueryDto,
  ) {
    const items = await this.memberService.list(orgId, {
      roleKey: query.roleKey,
      search: query.search,
    });
    return { items };
  }

  /**
   * POST /api/v1/orgs/:orgId/members/invite
   * Invites a user by email, creating a pending user record if they don't exist yet.
   * Returns the created membership.
   */
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('core:member:manage')
  async invite(
    @Param('orgId') orgId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: InviteMemberDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.memberService.inviteByEmail(user, orgId, {
      email: body.email,
      roleKey: body.roleKey,
    });
  }

  /**
   * PATCH /api/v1/orgs/:orgId/members/:userId/role
   * Changes the role of an existing member.
   */
  @Patch(':userId/role')
  @Permissions('core:member:manage')
  async changeRole(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ChangeMemberRoleDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.memberService.changeRole(user, orgId, userId, body.roleKey);
  }

  /**
   * POST /api/v1/orgs/:orgId/members
   * Legacy: assigns a role to an existing user (by id or email). User must already exist.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('core:member:manage')
  async assign(
    @Param('orgId') orgId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: AssignMemberDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.memberService.assign(
      orgId,
      { userIdOrEmail: body.userIdOrEmail, roleId: body.roleId },
      user,
    );
  }

  /**
   * PATCH /api/v1/orgs/:orgId/members/:userId
   * Legacy: updates a member's role by roleId.
   */
  @Patch(':userId')
  @Permissions('core:member:manage')
  async update(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateMemberDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.memberService.update(orgId, userId, { roleId: body.roleId }, user);
  }

  /**
   * DELETE /api/v1/orgs/:orgId/members/:userId
   * Removes a member from an organization.
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('core:member:manage')
  async remove(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ) {
    await this.memberService.remove(orgId, userId, user);
  }
}
