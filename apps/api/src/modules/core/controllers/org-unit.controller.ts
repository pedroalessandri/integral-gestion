import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { OrgUnitService } from '../services/org-unit.service.js';
import { CreateOrgUnitBodyDto, UpdateOrgUnitBodyDto, UpdateOrgUnitVisionBodyDto } from '../dto/org-unit.dto.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { OrgParamGuard } from '../../../common/guards/org-param.guard.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * OrgUnitController — ABM del árbol de unidades de gobierno (ADR-0009).
 *
 * AuthGuard corre global (APP_GUARD). TenantGuard verifica org activa + membresía.
 * Lectura: cualquier miembro (RN-P20: lectura de toda la org). Escritura: permiso
 * 'core:org-unit:manage' (org-admin; RN-P19). La raíz central se crea sola al crear la organización,
 * no hay POST para ella.
 *
 * Routes:
 *   GET    /api/v1/orgs/:orgId/org-units        — lista plana
 *   GET    /api/v1/orgs/:orgId/org-units/tree   — árbol
 *   GET    /api/v1/orgs/:orgId/org-units/:id
 *   POST   /api/v1/orgs/:orgId/org-units
 *   PATCH  /api/v1/orgs/:orgId/org-units/:id    — editar / mover
 *   PATCH  /api/v1/orgs/:orgId/org-units/:id/vision-mission — solo visión y misión ('core:org-unit:vision:write' + alcance)
 *   DELETE /api/v1/orgs/:orgId/org-units/:id    — soft delete
 */
@Controller('orgs/:orgId/org-units')
@UseGuards(TenantGuard, OrgParamGuard, PermissionsGuard)
export class OrgUnitController {
  constructor(private readonly orgUnitService: OrgUnitService) {}

  @Get()
  async list(@Param('orgId') orgId: string) {
    return { items: await this.orgUnitService.list(orgId) };
  }

  @Get('tree')
  async tree(@Param('orgId') orgId: string) {
    return { items: await this.orgUnitService.getTree(orgId) };
  }

  @Get(':id')
  async findById(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.orgUnitService.getById(orgId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('core:org-unit:manage')
  async create(
    @Param('orgId') orgId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    body: CreateOrgUnitBodyDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.orgUnitService.create(orgId, body, user);
  }

  @Patch(':id')
  @Permissions('core:org-unit:manage')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    body: UpdateOrgUnitBodyDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.orgUnitService.update(orgId, id, body, user);
  }

  /**
   * Edita solo visión y misión de la unidad (N3). Permiso fino `core:org-unit:vision:write`; el service exige además
   * alcance sobre la unidad (la propia o una descendiente). La estructura sigue en `PATCH :id` (manage + central).
   */
  @Patch(':id/vision-mission')
  @Permissions('core:org-unit:vision:write')
  async updateVisionMission(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    body: UpdateOrgUnitVisionBodyDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.orgUnitService.update(orgId, id, { vision: body.vision, mission: body.mission }, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('core:org-unit:manage')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ) {
    await this.orgUnitService.softDelete(orgId, id, user);
  }
}
