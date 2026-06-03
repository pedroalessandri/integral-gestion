import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ModuleEnablementService } from '../services/module-enablement.service.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * OrganizationModuleController — manages module enablement per organization.
 *
 * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard, SuperadminOnly) on enable/disable
 * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:module:manage') on GET
 */
@Controller('orgs/:orgId/modules')
export class OrganizationModuleController {
  constructor(private readonly moduleEnablementService: ModuleEnablementService) {}

  /**
   * GET /api/v1/orgs/:orgId/modules
   * Lists all modules (enabled and disabled) for an organization.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard) @Permissions('core:module:manage')
   *               OR @SuperadminOnly
   */
  @Get()
  async list(@Param('orgId') orgId: string) {
    return this.moduleEnablementService.listForOrganization(orgId);
  }

  /**
   * POST /api/v1/orgs/:orgId/modules/:moduleKey/enable
   * Enables a module for an organization. Superadmin only in MVP.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard, SuperadminOnly)
   */
  @Post(':moduleKey/enable')
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
   * Disables a module for an organization. Superadmin only in MVP.
   * TODO(ADR-0004): @UseGuards(AuthGuard, TenantGuard, SuperadminOnly)
   */
  @Post(':moduleKey/disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @Param('orgId') orgId: string,
    @Param('moduleKey') moduleKey: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.moduleEnablementService.disableModule(orgId, moduleKey, user);
  }
}
