import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard.js';
import { RequiresModule } from '../../../common/decorators/requires-module.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { MetricService } from '../services/metric.service.js';
import { CreateMetricDto } from '../dto/create-metric.dto.js';
import { UpdateMetricDto } from '../dto/update-metric.dto.js';
import { ListMetricsQueryDto } from '../dto/list-metrics-query.dto.js';

/**
 * Narrows organizationId from string | null to string.
 * TenantGuard ensures this is always populated for metrics endpoints.
 */
function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/** The :orgId path param must match the tenant of the request (x-organization-id). */
function assertOrgParam(orgId: string, user: AuthContext): string {
  if (orgId !== requireOrgId(user)) {
    throw new ForbiddenException('TenantMismatch');
  }
  return orgId;
}

/**
 * MetricController — metric catalog ABM + series (Módulo 1).
 * Routes per docs/features/indicadores-gestion.md §2:
 *  - /orgs/:orgId/metrics (listing + creation)
 *  - /metrics/:id (single metric operations + series)
 * Guard order matters: TenantGuard populates the org, ModuleEnabledGuard reads it.
 */
@UseGuards(TenantGuard, ModuleEnabledGuard, PermissionsGuard)
@RequiresModule('indicadores-gestion')
@Controller()
export class MetricController {
  constructor(private readonly metricService: MetricService) {}

  @Get('orgs/:orgId/metrics')
  @Permissions('metrics:read')
  async list(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthContext,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListMetricsQueryDto,
  ) {
    const items = await this.metricService.list(assertOrgParam(orgId, user), query);
    return { items };
  }

  @Post('orgs/:orgId/metrics')
  @Permissions('metrics:write')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthContext,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateMetricDto,
  ) {
    return this.metricService.create(assertOrgParam(orgId, user), dto, user);
  }

  @Get('metrics/:id')
  @Permissions('metrics:read')
  getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.metricService.getById(id, requireOrgId(user));
  }

  @Patch('metrics/:id')
  @Permissions('metrics:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    // forbidNonWhitelisted: unit/direction/frequency are immutable (RN-M2) —
    // attempts to send them are rejected instead of silently stripped.
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateMetricDto,
  ) {
    return this.metricService.update(id, requireOrgId(user), dto, user);
  }

  @Delete('metrics/:id')
  @Permissions('metrics:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.metricService.softDelete(id, requireOrgId(user), user);
  }

  @Get('metrics/:id/series')
  @Permissions('metrics:read')
  getSeries(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.metricService.getSeries(id, requireOrgId(user));
  }
}
