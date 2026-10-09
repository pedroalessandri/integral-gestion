import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard.js';
import { RequiresModule } from '../../../common/decorators/requires-module.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { MetricLinkService } from '../services/metric-link.service.js';

function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * MetricLinkController — metric↔objective context (Módulo 2).
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
