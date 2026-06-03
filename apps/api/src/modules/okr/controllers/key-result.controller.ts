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
} from '@nestjs/common';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { KeyResultService } from '../services/key-result.service.js';
import { CreateKeyResultDto } from '../dto/create-key-result.dto.js';
import { UpdateKeyResultDto } from '../dto/update-key-result.dto.js';

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
export class KeyResultController {
  constructor(private readonly keyResultService: KeyResultService) {}

  @Get('objectives/:objectiveId/key-results')
  @Permissions('okr:read')
  list(@CurrentUser() user: AuthContext, @Param('objectiveId') objectiveId: string) {
    return this.keyResultService.list(objectiveId, requireOrgId(user));
  }

  @Post('objectives/:objectiveId/key-results')
  @Permissions('okr:write')
  create(
    @CurrentUser() user: AuthContext,
    @Param('objectiveId') objectiveId: string,
    @Body() dto: CreateKeyResultDto,
  ) {
    return this.keyResultService.create(objectiveId, requireOrgId(user), dto, user);
  }

  @Get('key-results/:id')
  @Permissions('okr:read')
  getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.keyResultService.getById(id, requireOrgId(user));
  }

  @Patch('key-results/:id')
  @Permissions('okr:write')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateKeyResultDto,
  ) {
    return this.keyResultService.update(id, requireOrgId(user), dto, user);
  }

  @Delete('key-results/:id')
  @Permissions('okr:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.keyResultService.softDelete(id, requireOrgId(user), user);
  }
}
