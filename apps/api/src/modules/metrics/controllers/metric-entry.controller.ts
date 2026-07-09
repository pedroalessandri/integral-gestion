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
import { MetricEntryService } from '../services/metric-entry.service.js';
import { CreateMetricEntryDto } from '../dto/create-metric-entry.dto.js';
import { UpdateMetricEntryDto } from '../dto/update-metric-entry.dto.js';

function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * MetricEntryController — metric load history (Módulo 1).
 * Per docs/features/indicadores-gestion.md §2: retroactive loads allowed
 * (RN-M5), edits/deletes of past loads audited (RN-M6), closed period is
 * read-only (RN-M4, enforced in the service via assertPeriodOpen).
 */
@UseGuards(TenantGuard, ModuleEnabledGuard, PermissionsGuard)
@RequiresModule('indicadores-gestion')
@Controller('metrics/:id/entries')
export class MetricEntryController {
  constructor(private readonly metricEntryService: MetricEntryService) {}

  @Get()
  @Permissions('metrics:read')
  async list(@CurrentUser() user: AuthContext, @Param('id') metricId: string) {
    const items = await this.metricEntryService.list(metricId, requireOrgId(user));
    return { items };
  }

  @Post()
  @Permissions('metrics:entry:write')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthContext,
    @Param('id') metricId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateMetricEntryDto,
  ) {
    return this.metricEntryService.create(metricId, requireOrgId(user), dto, user);
  }

  @Patch(':entryId')
  @Permissions('metrics:entry:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') metricId: string,
    @Param('entryId') entryId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: UpdateMetricEntryDto,
  ) {
    return this.metricEntryService.update(metricId, entryId, requireOrgId(user), dto, user);
  }

  @Delete(':entryId')
  @Permissions('metrics:entry:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(
    @CurrentUser() user: AuthContext,
    @Param('id') metricId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.metricEntryService.softDelete(metricId, entryId, requireOrgId(user), user);
  }
}
