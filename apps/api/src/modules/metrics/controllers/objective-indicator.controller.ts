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
  Put,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ObjectiveIndicatorService } from '../services/objective-indicator.service.js';
import { CreateObjectiveIndicatorDto } from '../dto/create-objective-indicator.dto.js';
import { UpdateObjectiveIndicatorDto } from '../dto/update-objective-indicator.dto.js';
import { SetObjectiveIndicatorWeightsDto } from '../dto/set-objective-indicator-weights.dto.js';

/** Validación de DTOs en el borde (class-validator). Campos extra se rechazan, no se ignoran. */
const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

/**
 * Narrows organizationId from string | null to string.
 * TenantGuard ensures this is always populated for these endpoints.
 */
function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * Indicadores de un objetivo (N4, ADR-0009). Default deny: TenantGuard + PermissionsGuard.
 * Lectura `okr:read`, escritura `okr:write` (el indicador es parte del objetivo). Crear una métrica nueva en el
 * mismo paso también alcanza con `okr:write` (decisión de Pedro).
 */
// TODO: add ModuleEnabledGuard once it is implemented for okr (mismo criterio que ProjectController)
@UseGuards(TenantGuard, PermissionsGuard)
@Controller('okr')
export class ObjectiveIndicatorController {
  constructor(private readonly objectiveIndicatorService: ObjectiveIndicatorService) {}

  @Get('objectives/:objectiveId/indicators')
  @Permissions('okr:read')
  async list(@CurrentUser() user: AuthContext, @Param('objectiveId') objectiveId: string) {
    const items = await this.objectiveIndicatorService.listByObjective(objectiveId, requireOrgId(user));
    return { items };
  }

  @Post('objectives/:objectiveId/indicators')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthContext,
    @Param('objectiveId') objectiveId: string,
    @Body(bodyPipe) dto: CreateObjectiveIndicatorDto,
  ) {
    return this.objectiveIndicatorService.create(objectiveId, requireOrgId(user), dto, user);
  }

  @Put('objectives/:objectiveId/indicators/weights')
  @Permissions('okr:write')
  async setWeights(
    @CurrentUser() user: AuthContext,
    @Param('objectiveId') objectiveId: string,
    @Body(bodyPipe) dto: SetObjectiveIndicatorWeightsDto,
  ) {
    const items = await this.objectiveIndicatorService.setWeights(objectiveId, requireOrgId(user), dto, user);
    return { items };
  }

  @Get('indicators/:id')
  @Permissions('okr:read')
  getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.objectiveIndicatorService.getById(id, requireOrgId(user));
  }

  @Patch('indicators/:id')
  @Permissions('okr:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body(bodyPipe) dto: UpdateObjectiveIndicatorDto,
  ) {
    return this.objectiveIndicatorService.update(id, requireOrgId(user), dto, user);
  }

  @Delete('indicators/:id')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.objectiveIndicatorService.softDelete(id, requireOrgId(user), user);
  }
}
