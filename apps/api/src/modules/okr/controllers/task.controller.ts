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
} from '@nestjs/common';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { TaskService } from '../services/task.service.js';
import { CreateTaskDto } from '../dto/create-task.dto.js';
import { UpdateTaskDto } from '../dto/update-task.dto.js';
import { SetTaskProgressDto } from '../dto/set-task-progress.dto.js';

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

  @Get('key-results/:keyResultId/tasks')
  @Permissions('okr:read')
  list(@CurrentUser() user: AuthContext, @Param('keyResultId') keyResultId: string) {
    return this.taskService.list(keyResultId, requireOrgId(user));
  }

  @Post('key-results/:keyResultId/tasks')
  @Permissions('okr:write')
  create(
    @CurrentUser() user: AuthContext,
    @Param('keyResultId') keyResultId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.create(keyResultId, requireOrgId(user), dto, user);
  }

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
    @Body() dto: UpdateTaskDto,
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
    @Body() dto: SetTaskProgressDto,
  ) {
    return this.taskService.setProgress(id, requireOrgId(user), dto.progressBp, user);
  }
}
