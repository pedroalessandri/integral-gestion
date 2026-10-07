import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/index.js';
import { ObjectiveService } from './services/objective.service.js';
import { KeyResultService } from './services/key-result.service.js';
import { TaskService } from './services/task.service.js';
import { ProjectService } from './services/project.service.js';
import { ObjectiveController } from './controllers/objective.controller.js';
import { KeyResultController } from './controllers/key-result.controller.js';
import { TaskController } from './controllers/task.controller.js';
import { ProjectController } from './controllers/project.controller.js';

/**
 * OkrModule — Objectives, Key Results, Projects, Tasks with cascade recalculation.
 * Cascade arithmetic delegated to @gestion-publica/okr-domain (pure functions).
 * Per ADR 0001.
 */
@Module({
  imports: [CoreModule, AuditModule, AuthModule],
  controllers: [ObjectiveController, KeyResultController, TaskController, ProjectController],
  providers: [ObjectiveService, KeyResultService, TaskService, ProjectService],
  exports: [ObjectiveService, KeyResultService, TaskService, ProjectService],
})
export class OkrModule {}
