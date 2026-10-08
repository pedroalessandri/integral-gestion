import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ProjectService } from '../services/project.service.js';
import { TaskService } from '../services/task.service.js';
import { CreateProjectDto } from '../dto/create-project.dto.js';
import { UpdateProjectDto } from '../dto/update-project.dto.js';
import { CreateProjectTaskDto } from '../dto/create-project-task.dto.js';
import { SetSiblingWeightsDto } from '../dto/set-sibling-weights.dto.js';

/** Validación de DTOs en el borde (class-validator). */
const bodyPipe = new ValidationPipe({ transform: true, whitelist: true });

/**
 * Narrows organizationId from string | null to string.
 * TenantGuard ensures this is always populated for OKR endpoints.
 */
function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * Proyectos (N5) de un objetivo y sus tareas. Default deny: TenantGuard + PermissionsGuard.
 * Lectura `okr:read`, escritura `okr:write` (mismos permisos que el resto del módulo).
 */
// TODO: add ModuleEnabledGuard once it is implemented
@UseGuards(TenantGuard, PermissionsGuard)
@Controller('okr')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly taskService: TaskService,
  ) {}

  @Get('objectives/:objectiveId/projects')
  @Permissions('okr:read')
  list(@CurrentUser() user: AuthContext, @Param('objectiveId') objectiveId: string) {
    return this.projectService.listByObjective(objectiveId, requireOrgId(user));
  }

  @Post('objectives/:objectiveId/projects')
  @Permissions('okr:write')
  create(
    @CurrentUser() user: AuthContext,
    @Param('objectiveId') objectiveId: string,
    @Body(bodyPipe) dto: CreateProjectDto,
  ) {
    return this.projectService.create(objectiveId, requireOrgId(user), dto, user);
  }

  @Put('objectives/:objectiveId/projects/weights')
  @Permissions('okr:write')
  setWeights(
    @CurrentUser() user: AuthContext,
    @Param('objectiveId') objectiveId: string,
    @Body(bodyPipe) dto: SetSiblingWeightsDto,
  ) {
    return this.projectService.setObjectiveProjectWeights(objectiveId, requireOrgId(user), dto, user);
  }

  @Get('projects/:id')
  @Permissions('okr:read')
  getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.projectService.getById(id, requireOrgId(user));
  }

  @Patch('projects/:id')
  @Permissions('okr:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body(bodyPipe) dto: UpdateProjectDto,
  ) {
    return this.projectService.update(id, requireOrgId(user), dto, user);
  }

  @Delete('projects/:id')
  @Permissions('okr:write')
  softDelete(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.projectService.softDelete(id, requireOrgId(user), user);
  }

  @Get('projects/:projectId/tasks')
  @Permissions('okr:read')
  listTasks(@CurrentUser() user: AuthContext, @Param('projectId') projectId: string) {
    return this.taskService.listByProject(projectId, requireOrgId(user));
  }

  @Post('projects/:projectId/tasks')
  @Permissions('okr:write')
  createTask(
    @CurrentUser() user: AuthContext,
    @Param('projectId') projectId: string,
    @Body(bodyPipe) dto: CreateProjectTaskDto,
  ) {
    return this.taskService.createInProject(projectId, requireOrgId(user), dto, user);
  }

  @Put('projects/:projectId/tasks/weights')
  @Permissions('okr:write')
  setTaskWeights(
    @CurrentUser() user: AuthContext,
    @Param('projectId') projectId: string,
    @Body(bodyPipe) dto: SetSiblingWeightsDto,
  ) {
    return this.taskService.setProjectTaskWeights(projectId, requireOrgId(user), dto, user);
  }
}
