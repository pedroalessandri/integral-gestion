import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { OrganizationService } from '../services/organization.service.js';
import { CreateOrganizationDto } from '../dto/create-organization.dto.js';
import { UpdateOrganizationDto } from '../dto/update-organization.dto.js';
import { DeactivateOrganizationDto } from '../dto/deactivate-organization.dto.js';
import { ListOrgsQueryDto } from '../dto/list-orgs-query.dto.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { SuperadminOnlyGuard } from '../../auth/guards/superadmin-only.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { OrgIdParamGuard } from '../../../common/guards/org-id-param.guard.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * OrganizationController — manages organizations (superadmin operations).
 *
 * Guards (C20b), default deny sobre el AuthGuard global:
 *  - Listar, crear, activar y desactivar organizaciones: solo superadmin (SuperadminOnlyGuard).
 *  - GET orgs/:id y PATCH orgs/:id: TenantGuard + OrgIdParamGuard (el `:id` debe ser la org del header).
 *    GET: cualquier miembro. PATCH (contexto de la org: nombre, misión, visión...): 'core:org-unit:manage'
 *    + alcance central (OrganizationService); lo usa el formulario de configuración del org-admin.
 */
@Controller('orgs')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * GET /api/v1/orgs
   * Lists all organizations. Superadmin only.
   */
  @Get()
  @UseGuards(SuperadminOnlyGuard)
  async list(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListOrgsQueryDto) {
    return this.organizationService.list(query);
  }

  /**
   * GET /api/v1/orgs/:id
   * Gets an organization by ID. Members of that org (header = :id) and superadmin.
   */
  @Get(':id')
  @UseGuards(TenantGuard, OrgIdParamGuard)
  async findById(@Param('id') id: string) {
    return this.organizationService.findById(id);
  }

  /**
   * POST /api/v1/orgs
   * Creates organization + first period atomically (D8-c). Superadmin only.
   */
  @Post()
  @UseGuards(SuperadminOnlyGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateOrganizationDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.organizationService.create(
      {
        slug: body.slug,
        name: body.name,
        firstPeriod: body.firstPeriod,
      },
      user,
    );
  }

  /**
   * PATCH /api/v1/orgs/:id
   * Updates organization name/context. Org-admin of that org and superadmin.
   */
  @Patch(':id')
  @UseGuards(TenantGuard, OrgIdParamGuard, PermissionsGuard)
  @Permissions('core:org-unit:manage')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateOrganizationDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.organizationService.update(id, body, user);
  }

  /**
   * POST /api/v1/orgs/:id/deactivate
   * Deactivates an organization. Superadmin only.
   */
  @Post(':id/deactivate')
  @UseGuards(SuperadminOnlyGuard)
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: DeactivateOrganizationDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.organizationService.deactivate(id, user, body.reason);
  }

  /**
   * POST /api/v1/orgs/:id/activate
   * Activates an organization. Superadmin only.
   */
  @Post(':id/activate')
  @UseGuards(SuperadminOnlyGuard)
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.organizationService.activate(id, user);
  }
}
