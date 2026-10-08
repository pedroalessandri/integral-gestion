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
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ProjectContributionService } from '../services/project-contribution.service.js';
import { CreateProjectContributionDto, UpdateProjectContributionDto } from '../dto/project-contribution.dto.js';

/** Validación de DTOs en el borde (class-validator). Campos extra se rechazan, no se ignoran. */
const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * Aportes de proyectos a indicadores (RN-P12/P13/P14, ADR-0009). Default deny: TenantGuard + PermissionsGuard.
 * Lectura `okr:read`, escritura `okr:write` (el aporte es parte del objetivo, igual que el indicador).
 * Sin lógica de negocio acá: todo vive en `ProjectContributionService`.
 */
// TODO: add ModuleEnabledGuard once it is implemented for okr (mismo criterio que ObjectiveIndicatorController)
@UseGuards(TenantGuard, PermissionsGuard)
@Controller('okr')
export class ProjectContributionController {
  constructor(private readonly contributionService: ProjectContributionService) {}

  @Get('indicators/:indicatorId/contributions')
  @Permissions('okr:read')
  async listByIndicator(@CurrentUser() user: AuthContext, @Param('indicatorId') indicatorId: string) {
    const items = await this.contributionService.listByIndicator(indicatorId, requireOrgId(user));
    return { items };
  }

  /** Aportes de un proyecto (sección "Aporta a indicador" de la ficha de proyecto). */
  @Get('projects/:projectId/contributions')
  @Permissions('okr:read')
  async listByProject(@CurrentUser() user: AuthContext, @Param('projectId') projectId: string) {
    const items = await this.contributionService.listByProject(projectId, requireOrgId(user));
    return { items };
  }

  @Post('indicators/:indicatorId/contributions')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthContext,
    @Param('indicatorId') indicatorId: string,
    @Body(bodyPipe) dto: CreateProjectContributionDto,
  ) {
    return this.contributionService.create(indicatorId, requireOrgId(user), dto, user);
  }

  @Patch('contributions/:id')
  @Permissions('okr:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body(bodyPipe) dto: UpdateProjectContributionDto,
  ) {
    return this.contributionService.update(id, requireOrgId(user), dto, user);
  }

  @Delete('contributions/:id')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.contributionService.remove(id, requireOrgId(user), user);
  }
}
