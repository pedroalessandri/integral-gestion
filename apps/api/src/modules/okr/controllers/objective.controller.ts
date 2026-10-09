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
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ObjectiveService } from '../services/objective.service.js';
import { CreateObjectiveDto } from '../dto/create-objective.dto.js';
import { UpdateObjectiveDto } from '../dto/update-objective.dto.js';

/** Validación de DTOs en el borde (class-validator). */
const bodyPipe = new ValidationPipe({ transform: true, whitelist: true });

/**
 * Narrows organizationId from string | null to string.
 * TenantGuard ensures this is always populated for OKR endpoints.
 * Throws ForbiddenException as a safety net if called without TenantGuard.
 */
function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

// TODO: add ModuleEnabledGuard once it is implemented
@UseGuards(TenantGuard, PermissionsGuard)
@Controller('okr/objectives')
export class ObjectiveController {
  constructor(private readonly objectiveService: ObjectiveService) {}

  @Get()
  @Permissions('okr:read')
  list(
    @CurrentUser() user: AuthContext,
    @Query('periodId') periodId?: string,
  ) {
    return this.objectiveService.list(requireOrgId(user), periodId);
  }

  @Get(':id')
  @Permissions('okr:read')
  getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.objectiveService.getById(id, requireOrgId(user));
  }

  @Post()
  @Permissions('okr:write')
  create(@CurrentUser() user: AuthContext, @Body(bodyPipe) dto: CreateObjectiveDto) {
    return this.objectiveService.create(requireOrgId(user), dto, user);
  }

  @Patch(':id')
  @Permissions('okr:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body(bodyPipe) dto: UpdateObjectiveDto,
  ) {
    return this.objectiveService.update(id, requireOrgId(user), dto, user);
  }

  @Delete(':id')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.objectiveService.softDelete(id, requireOrgId(user), user);
  }
}
