import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/index.js';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard.js';
import { MetricService } from './services/metric.service.js';
import { MetricEntryService } from './services/metric-entry.service.js';
import { MetricController } from './controllers/metric.controller.js';
import { MetricEntryController } from './controllers/metric-entry.controller.js';

/**
 * MetricsModule — Módulo 1 "Indicadores de gestión".
 * Metric catalog + periodic loads + expected-vs-real math delegated to
 * @gestion-publica/metrics-domain (pure functions).
 * Gated per-organization by ModuleEnabledGuard ('indicadores-gestion').
 * Per docs/features/indicadores-gestion.md.
 */
@Module({
  imports: [CoreModule, AuditModule, AuthModule],
  controllers: [MetricController, MetricEntryController],
  providers: [MetricService, MetricEntryService, ModuleEnabledGuard],
  exports: [MetricService, MetricEntryService],
})
export class MetricsModule {}
