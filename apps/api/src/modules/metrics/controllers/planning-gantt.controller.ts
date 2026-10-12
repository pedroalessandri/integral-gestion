import { Controller, ForbiddenException, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import type { PlanningGanttDto } from '@gestion-publica/shared-types/okr';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard.js';
import { RequiresModule } from '../../../common/decorators/requires-module.decorator.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { PlanningGanttService } from '../services/planning-gantt.service.js';
import { PlanningTreeQueryDto } from '../dto/planning-tree-query.dto.js';

const queryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

/**
 * Vista ejecutiva Objetivo -> Proyecto -> Tarea (SPEC §5.7). Default deny: TenantGuard + PermissionsGuard,
 * `okr:read`. Lecturas abiertas a toda la organización (RN-P20). Ruta sin `:orgId`: la org sale del contexto.
 */
@UseGuards(TenantGuard, ModuleEnabledGuard, PermissionsGuard)
@RequiresModule('okr')
@Controller('okr')
export class PlanningGanttController {
  constructor(private readonly planningGanttService: PlanningGanttService) {}

  @Get('planning-gantt')
  @Permissions('okr:read')
  getPlanningGantt(
    @CurrentUser() user: AuthContext,
    @Query(queryPipe) query: PlanningTreeQueryDto,
  ): Promise<PlanningGanttDto> {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization context required');
    }
    return this.planningGanttService.getPlanningGantt(user.organizationId, query);
  }
}
