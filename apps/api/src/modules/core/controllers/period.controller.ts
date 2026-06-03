import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { PeriodService } from '../services/period.service.js';
import { CreatePeriodDto } from '../dto/create-period.dto.js';
import { ListPeriodsQueryDto } from '../dto/list-periods-query.dto.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * PeriodController — manages period lifecycle.
 *
 * Routes:
 *  - /orgs/:orgId/periods (nested listing + creation)
 *  - /periods/:id (single period operations)
 *
 * Periods are non-editable after creation (no PATCH endpoint).
 *
 * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
 */
@Controller()
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  /**
   * GET /api/v1/orgs/:orgId/periods
   * Lists periods for an organization (excludes soft-deleted).
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
   */
  @Get('orgs/:orgId/periods')
  async list(
    @Param('orgId') orgId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListPeriodsQueryDto,
  ) {
    const items = await this.periodService.listForOrganization(orgId, {
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return { items };
  }

  /**
   * GET /api/v1/periods/:id
   * Gets a period by ID.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
   */
  @Get('periods/:id')
  async findById(@Param('id') id: string) {
    return this.periodService.getById(id);
  }

  /**
   * POST /api/v1/orgs/:orgId/periods
   * Creates a period in status='future'. Non-editable after creation.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
   */
  @Post('orgs/:orgId/periods')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('orgId') orgId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreatePeriodDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.periodService.createForOrganization(
      orgId,
      {
        code: body.code,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        status: 'future',
      },
      user,
    );
  }

  /**
   * POST /api/v1/periods/:id/open
   * Transitions period future -> open.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
   */
  @Post('periods/:id/open')
  @HttpCode(HttpStatus.OK)
  async open(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.periodService.openPeriod(id, user);
  }

  /**
   * POST /api/v1/periods/:id/close
   * Transitions period open -> closed. Admin-only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
   */
  @Post('periods/:id/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.periodService.closePeriod(id, user, 'manual');
  }

  /**
   * DELETE /api/v1/periods/:id
   * Soft-deletes a period and cascades deletedAt to all Objectives/KRs/Tasks.
   * Admin-only — requires 'core:period:manage' permission or superadmin.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:period:manage')
   */
  @Delete('periods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.periodService.softDeletePeriod(id, user);
  }
}
