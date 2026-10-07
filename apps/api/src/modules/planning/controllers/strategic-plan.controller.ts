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
  Put,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { OrgParamGuard } from '../../../common/guards/org-param.guard.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { StrategicPlanService } from '../services/strategic-plan.service.js';
import { AxisService } from '../services/axis.service.js';
import { UpsertStrategicPlanBodyDto } from '../dto/strategic-plan.dto.js';
import { CreateAxisBodyDto, UpdateAxisBodyDto } from '../dto/axis.dto.js';

const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

/**
 * StrategicPlanController — plan de gobierno vigente (N1) y ejes (N2), ADR-0009.
 *
 * AuthGuard corre global (APP_GUARD). TenantGuard verifica org activa + membresía.
 * Lectura: `okr:read` (RN-P20: lectura de toda la org). Escritura: `planning:plan:manage` (org-admin, RN-P19).
 *
 * Routes:
 *   GET    /api/v1/orgs/:orgId/strategic-plan            — plan activo (404 si no hay)
 *   PUT    /api/v1/orgs/:orgId/strategic-plan            — upsert del plan activo
 *   GET    /api/v1/orgs/:orgId/strategic-plan/axes       — ejes vivos del plan activo
 *   GET    /api/v1/orgs/:orgId/strategic-plan/axes/:id
 *   POST   /api/v1/orgs/:orgId/strategic-plan/axes
 *   PATCH  /api/v1/orgs/:orgId/strategic-plan/axes/:id
 *   DELETE /api/v1/orgs/:orgId/strategic-plan/axes/:id  — soft delete (200; desasigna sus objetivos)
 */
@Controller('orgs/:orgId/strategic-plan')
@UseGuards(TenantGuard, OrgParamGuard, PermissionsGuard)
export class StrategicPlanController {
  constructor(
    private readonly planService: StrategicPlanService,
    private readonly axisService: AxisService,
  ) {}

  @Get()
  @Permissions('okr:read')
  getActive(@Param('orgId') orgId: string) {
    return this.planService.getActive(orgId);
  }

  @Put()
  @Permissions('planning:plan:manage')
  upsert(
    @Param('orgId') orgId: string,
    @Body(bodyPipe) body: UpsertStrategicPlanBodyDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.planService.upsertActive(orgId, body, user);
  }

  @Get('axes')
  @Permissions('okr:read')
  async listAxes(@Param('orgId') orgId: string) {
    return { items: await this.axisService.list(orgId) };
  }

  @Get('axes/:id')
  @Permissions('okr:read')
  getAxis(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.axisService.getById(orgId, id);
  }

  @Post('axes')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('planning:plan:manage')
  createAxis(
    @Param('orgId') orgId: string,
    @Body(bodyPipe) body: CreateAxisBodyDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.axisService.create(orgId, body, user);
  }

  @Patch('axes/:id')
  @Permissions('planning:plan:manage')
  updateAxis(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(bodyPipe) body: UpdateAxisBodyDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.axisService.update(orgId, id, body, user);
  }

  /** Soft delete. Los objetivos del eje quedan sin eje; la respuesta lista los afectados. */
  @Delete('axes/:id')
  @Permissions('planning:plan:manage')
  removeAxis(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.axisService.softDelete(orgId, id, user);
  }
}
