import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ModuleEnablementService } from '../services/module-enablement.service.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { SuperadminOnlyGuard } from '../../auth/guards/superadmin-only.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * OrganizationModuleController — manages module enablement per organization.
 *
 * AuthGuard runs globally (APP_GUARD in AppModule); per-route guards here add
 * tenant scoping plus superadmin-only on mutations, per ADR-0004.
 */
@Controller('orgs/:orgId/modules')
export class OrganizationModuleController {
  constructor(private readonly moduleEnablementService: ModuleEnablementService) {}

  /**
   * GET /api/v1/orgs/:orgId/modules
   * Lists all modules (enabled and disabled) for an organization.
   */
  @Get()
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('core:module:manage')
  async list(@Param('orgId') orgId: string) {
    return this.moduleEnablementService.listForOrganization(orgId);
  }

  /**
   * POST /api/v1/orgs/:orgId/modules/:moduleKey/enable
   * Enables a module for an organization. Superadmin only.
   */
  @Post(':moduleKey/enable')
  @UseGuards(TenantGuard, SuperadminOnlyGuard)
  @HttpCode(HttpStatus.CREATED)
  async enable(
    @Param('orgId') orgId: string,
    @Param('moduleKey') moduleKey: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.moduleEnablementService.enableModule(orgId, moduleKey, user);
  }

  /**
   * POST /api/v1/orgs/:orgId/modules/:moduleKey/disable
   * Disables a module for an organization. Superadmin only.
   */
  @Post(':moduleKey/disable')
  @UseGuards(TenantGuard, SuperadminOnlyGuard)
  @HttpCode(HttpStatus.OK)
  async disable(
    @Param('orgId') orgId: string,
    @Param('moduleKey') moduleKey: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.moduleEnablementService.disableModule(orgId, moduleKey, user);
  }
}
