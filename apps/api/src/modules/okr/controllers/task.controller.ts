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
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { TaskService } from '../services/task.service.js';
import { UpdateTaskDto } from '../dto/update-task.dto.js';
import { SetTaskProgressDto } from '../dto/set-task-progress.dto.js';

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
@Controller('okr')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get('tasks/:id')
  @Permissions('okr:read')
  getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.taskService.getById(id, requireOrgId(user));
  }

  @Patch('tasks/:id')
  @Permissions('okr:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body(bodyPipe) dto: UpdateTaskDto,
  ) {
    return this.taskService.update(id, requireOrgId(user), dto, user);
  }

  @Delete('tasks/:id')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.taskService.softDelete(id, requireOrgId(user), user);
  }

  @Put('tasks/:id/progress')
  @Permissions('okr:progress:write')
  setProgress(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body(bodyPipe) dto: SetTaskProgressDto,
  ) {
    return this.taskService.setProgress(id, requireOrgId(user), dto.progressBp, user);
  }
}
