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
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { PeriodService } from '../services/period.service.js';
import { CreatePeriodDto } from '../dto/create-period.dto.js';
import { ListPeriodsQueryDto } from '../dto/list-periods-query.dto.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { OrgParamGuard } from '../../../common/guards/org-param.guard.js';
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
 * Guards (C20b): AuthGuard global + TenantGuard (membresía en la org del header).
 *  - Lecturas: cualquier miembro (el selector de período lo usan todos los roles).
 *  - Mutaciones: 'core:period:manage' + alcance central (lo evalúa PeriodService vía ORG_UNIT_SCOPE).
 *  - Rutas `orgs/:orgId/...`: OrgParamGuard. Rutas `periods/:id*`: PeriodService resuelve el período
 *    con la org del tenant (404 si es de otra org).
 */
@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  /**
   * GET /api/v1/orgs/:orgId/periods
   * Lists periods for an organization (excludes soft-deleted).
   */
  @Get('orgs/:orgId/periods')
  @UseGuards(OrgParamGuard)
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
   */
  @Get('periods/:id')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.periodService.getById(id, user);
  }

  /**
   * POST /api/v1/orgs/:orgId/periods
   * Creates a period in status='future'. Non-editable after creation.
   */
  @Post('orgs/:orgId/periods')
  @UseGuards(OrgParamGuard)
  @Permissions('core:period:manage')
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
   */
  @Post('periods/:id/open')
  @Permissions('core:period:manage')
  @HttpCode(HttpStatus.OK)
  async open(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.periodService.openPeriod(id, user);
  }

  /**
   * POST /api/v1/periods/:id/close
   * Transitions period open -> closed. Admin-only.
   */
  @Post('periods/:id/close')
  @Permissions('core:period:manage')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.periodService.closePeriod(id, user, 'manual');
  }

  /**
   * DELETE /api/v1/periods/:id
   * Soft-deletes a period and cascades deletedAt to all Objectives/KRs/Tasks.
   * Admin-only — requires 'core:period:manage' permission or superadmin.
   */
  @Delete('periods/:id')
  @Permissions('core:period:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.periodService.softDeletePeriod(id, user);
  }
}
