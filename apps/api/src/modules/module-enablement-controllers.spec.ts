import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { REQUIRES_MODULE_KEY } from '../common/decorators/requires-module.decorator';
import { ObjectiveController } from './okr/controllers/objective.controller';
import { TaskController } from './okr/controllers/task.controller';
import { ProjectController } from './okr/controllers/project.controller';
import { PlanningTreeController } from './metrics/controllers/planning-tree.controller';
import { PlanningGanttController } from './metrics/controllers/planning-gantt.controller';
import { ObjectiveIndicatorController } from './metrics/controllers/objective-indicator.controller';
import { ProjectContributionController } from './metrics/controllers/project-contribution.controller';

/**
 * Los controllers de planificación (módulo `okr`) deben pasar por ModuleEnabledGuard (403 ModuleDisabled
 * si la org no tiene el módulo). El comportamiento del guard está en module-enabled.guard.spec.ts.
 */
describe('ModuleEnabledGuard en los controllers de planificación', () => {
  const cases: Array<[string, new (...args: never[]) => unknown, string[]]> = [
    ['ObjectiveController', ObjectiveController, ['okr']],
    ['TaskController', TaskController, ['okr']],
    ['ProjectController', ProjectController, ['okr']],
    ['PlanningTreeController', PlanningTreeController, ['okr']],
    ['PlanningGanttController', PlanningGanttController, ['okr']],
    ['ObjectiveIndicatorController', ObjectiveIndicatorController, ['okr', 'indicadores-gestion']],
    ['ProjectContributionController', ProjectContributionController, ['okr', 'indicadores-gestion']],
  ];

  it.each(cases)('%s usa ModuleEnabledGuard y @RequiresModule', (_name, controller, modules) => {
    const guards = Reflect.getMetadata('__guards__', controller) as unknown[];
    expect(guards).toContain(ModuleEnabledGuard);
    expect(Reflect.getMetadata(REQUIRES_MODULE_KEY, controller)).toEqual(modules);
  });
});
