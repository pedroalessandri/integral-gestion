import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { StrategicPlanService } from './services/strategic-plan.service.js';
import { AxisService } from './services/axis.service.js';
import { StrategicPlanController } from './controllers/strategic-plan.controller.js';

/**
 * PlanningModule — plan de gobierno (N1) y ejes (N2), ADR-0009.
 * Valida contra `okr` por puertos de `common/contracts` (AXIS_OBJECTIVE_COUNTER), sin importarlo.
 */
@Module({
  imports: [AuditModule],
  controllers: [StrategicPlanController],
  providers: [StrategicPlanService, AxisService],
  exports: [StrategicPlanService, AxisService],
})
export class PlanningModule {}
