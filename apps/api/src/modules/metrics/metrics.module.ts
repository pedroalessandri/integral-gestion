import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/index.js';
import { OkrModule } from '../okr/index.js';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard.js';
import { MetricService } from './services/metric.service.js';
import { MetricEntryService } from './services/metric-entry.service.js';
import { MetricLinkService } from './services/metric-link.service.js';
import { ObjectiveIndicatorService } from './services/objective-indicator.service.js';
import { IndicatorStatusService } from './services/indicator-status.service.js';
import { PlanningGanttService } from './services/planning-gantt.service.js';
import { PlanningTreeService } from './services/planning-tree.service.js';
import { ProjectContributionService } from './services/project-contribution.service.js';
import { ProjectContributionApplier } from './services/project-contribution-applier.service.js';
import { ProjectLifecycleListener } from './listeners/project-lifecycle.listener.js';
import { MetricController } from './controllers/metric.controller.js';
import { MetricEntryController } from './controllers/metric-entry.controller.js';
import { MetricLinkController } from './controllers/metric-link.controller.js';
import { ObjectiveIndicatorController } from './controllers/objective-indicator.controller.js';
import { PlanningGanttController } from './controllers/planning-gantt.controller.js';
import { PlanningTreeController } from './controllers/planning-tree.controller.js';
import { ProjectContributionController } from './controllers/project-contribution.controller.js';

/**
 * MetricsModule — Módulo 1 "Indicadores de gestión".
 * Metric catalog + periodic loads + expected-vs-real math delegated to
 * @gestion-publica/metrics-domain (pure functions).
 * Gated per-organization by ModuleEnabledGuard ('indicadores-gestion').
 * Per docs/features/indicadores-gestion.md.
 */
@Module({
  imports: [CoreModule, AuditModule, AuthModule, OkrModule],
  controllers: [
    MetricController,
    MetricEntryController,
    MetricLinkController,
    ObjectiveIndicatorController,
    ProjectContributionController,
    PlanningTreeController,
    PlanningGanttController,
  ],
  providers: [
    MetricService,
    MetricEntryService,
    MetricLinkService,
    ObjectiveIndicatorService,
    IndicatorStatusService,
    PlanningTreeService,
    PlanningGanttService,
    ProjectContributionService,
    ProjectContributionApplier,
    ProjectLifecycleListener,
    ModuleEnabledGuard,
  ],
  exports: [
    MetricService,
    MetricEntryService,
    MetricLinkService,
    ObjectiveIndicatorService,
    IndicatorStatusService,
    ProjectContributionService,
  ],
})
export class MetricsModule {}
