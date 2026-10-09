import { Controller, ForbiddenException, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import type { PlanningTreeDto } from '@gestion-publica/shared-types/okr';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { PlanningTreeService } from '../services/planning-tree.service.js';
import { PlanningTreeQueryDto } from '../dto/planning-tree-query.dto.js';

const queryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

/**
 * Árbol de planificación y tableros (SPEC §5.2/§5.3). Default deny: TenantGuard + PermissionsGuard, `okr:read`.
 * Las lecturas están abiertas a toda la organización (RN-P20): sin filtro por alcance de unidad.
 */
// TODO: add ModuleEnabledGuard once it is implemented for okr (mismo criterio que el resto de los controllers de okr)
@UseGuards(TenantGuard, PermissionsGuard)
@Controller('okr')
export class PlanningTreeController {
  constructor(private readonly planningTreeService: PlanningTreeService) {}

  @Get('planning-tree')
  @Permissions('okr:read')
  getPlanningTree(
    @CurrentUser() user: AuthContext,
    @Query(queryPipe) query: PlanningTreeQueryDto,
  ): Promise<PlanningTreeDto> {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization context required');
    }
    return this.planningTreeService.getPlanningTree(user.organizationId, query);
  }
}
