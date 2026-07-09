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
  Put,
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
import { MetricLinkService } from '../services/metric-link.service.js';
import { UpsertMetricKrLinkDto } from '../dto/upsert-metric-kr-link.dto.js';
import { UpdateMetricKrLinkDto } from '../dto/update-metric-kr-link.dto.js';

function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * MetricLinkController — metric↔KR link + metric↔objective context (Módulo 2).
 * Routes per docs/features/indicadores-okr.md §5.
 *
 * RN-O11: every endpoint requires BOTH modules enabled. The guard rejects the
 * request unless 'indicadores-okr' AND 'indicadores-gestion' are on for the org.
 * Guard order matters: TenantGuard populates the org, ModuleEnabledGuard reads it.
 */
@UseGuards(TenantGuard, ModuleEnabledGuard, PermissionsGuard)
@RequiresModule('indicadores-okr', 'indicadores-gestion')
@Controller()
export class MetricLinkController {
  constructor(private readonly metricLinkService: MetricLinkService) {}

  @Put('key-results/:id/metric-link')
  @Permissions('metrics:write')
  upsertLink(
    @CurrentUser() user: AuthContext,
    @Param('id') keyResultId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: UpsertMetricKrLinkDto,
  ) {
    return this.metricLinkService.upsert(keyResultId, requireOrgId(user), dto, user);
  }

  @Patch('key-results/:id/metric-link')
  @Permissions('metrics:write')
  updateLink(
    @CurrentUser() user: AuthContext,
    @Param('id') keyResultId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateMetricKrLinkDto,
  ) {
    return this.metricLinkService.update(keyResultId, requireOrgId(user), dto, user);
  }

  @Delete('key-results/:id/metric-link')
  @Permissions('metrics:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLink(@CurrentUser() user: AuthContext, @Param('id') keyResultId: string) {
    return this.metricLinkService.remove(keyResultId, requireOrgId(user), user);
  }

  @Get('metrics/:id/links')
  @Permissions('metrics:read')
  async listLinks(@CurrentUser() user: AuthContext, @Param('id') metricId: string) {
    const items = await this.metricLinkService.listByMetric(metricId, requireOrgId(user));
    return { items };
  }

  @Put('objectives/:id/context-metrics/:metricId')
  @Permissions('metrics:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  addContext(
    @CurrentUser() user: AuthContext,
    @Param('id') objectiveId: string,
    @Param('metricId') metricId: string,
  ) {
    return this.metricLinkService.addContext(objectiveId, metricId, requireOrgId(user), user);
  }

  @Delete('objectives/:id/context-metrics/:metricId')
  @Permissions('metrics:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeContext(
    @CurrentUser() user: AuthContext,
    @Param('id') objectiveId: string,
    @Param('metricId') metricId: string,
  ) {
    return this.metricLinkService.removeContext(objectiveId, metricId, requireOrgId(user), user);
  }

  @Get('objectives/:id/context-metrics')
  @Permissions('metrics:read')
  async listContext(@CurrentUser() user: AuthContext, @Param('id') objectiveId: string) {
    const items = await this.metricLinkService.listContext(objectiveId, requireOrgId(user));
    return { items };
  }
}
