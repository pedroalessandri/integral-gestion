import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/index.js';
import { ObjectiveService } from './services/objective.service.js';
import { TaskService } from './services/task.service.js';
import { ProjectService } from './services/project.service.js';
import { ProjectLifecyclePublisher } from './services/project-lifecycle-publisher.js';
import { IndicatorProgressListener } from './listeners/indicator-progress.listener.js';
import { ObjectiveController } from './controllers/objective.controller.js';
import { TaskController } from './controllers/task.controller.js';
import { ProjectController } from './controllers/project.controller.js';

/**
 * OkrModule — Objetivos, Proyectos, Tasks with cascade recalculation.
 * Cascade arithmetic delegated to @gestion-publica/okr-domain (pure functions).
 * Per ADR 0001.
 */
@Module({
  imports: [CoreModule, AuditModule, AuthModule],
  controllers: [ObjectiveController, TaskController, ProjectController],
  providers: [ObjectiveService, TaskService, ProjectService, ProjectLifecyclePublisher, IndicatorProgressListener],
  exports: [ObjectiveService, TaskService, ProjectService],
})
export class OkrModule {}
