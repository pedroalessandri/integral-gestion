import type {
  ObjectivePlanGanttDto,
  PlanningGanttDto,
  ProjectGanttDto,
  TaskGanttDto,
  TaskStatus,
} from '@gestion-publica/shared-types/okr';
import { projectDisplayStatus } from '@/features/projects/status';

/** Filas del Gantt ejecutivo, ya aplanadas según qué está expandido. Lógica pura: no recalcula avances. */
export type GanttPlanRow =
  | {
      kind: 'objective';
      key: string;
      objective: ObjectivePlanGanttDto;
      collapsed: boolean;
      href: string;
    }
  | { kind: 'no-projects'; key: string; objectiveId: string }
  | {
      kind: 'project';
      key: string;
      objectiveId: string;
      project: ProjectGanttDto;
      status: TaskStatus;
      fromIndicator: boolean;
      href: string;
    }
  | { kind: 'no-tasks'; key: string; projectId: string }
  | {
      kind: 'task';
      key: string;
      objectiveId: string;
      task: TaskGanttDto;
      informative: boolean;
      href: string;
    };

export interface BuildRowsOptions {
  showTasks: boolean;
  collapsedIds: ReadonlySet<string>;
  now?: Date;
}

export function buildGanttRows(data: PlanningGanttDto, opts: BuildRowsOptions): GanttPlanRow[] {
  const rows: GanttPlanRow[] = [];
  const now = opts.now ?? new Date(data.asOf);
  for (const objective of data.objectives) {
    const href = `/objectives/${objective.id}`;
    const collapsed = opts.collapsedIds.has(objective.id);
    rows.push({ kind: 'objective', key: `o-${objective.id}`, objective, collapsed, href });
    if (collapsed) continue;
    if (objective.projects.length === 0) {
      rows.push({ kind: 'no-projects', key: `np-${objective.id}`, objectiveId: objective.id });
      continue;
    }
    for (const project of objective.projects) {
      const fromIndicator = project.progressMode === 'from_indicator';
      // La ficha de proyecto tiene ruta propia; las tareas tienen ancla `task-<id>` en ella.
      const projectHref = `${href}/projects/${project.id}`;
      rows.push({
        kind: 'project',
        key: `p-${project.id}`,
        objectiveId: objective.id,
        project,
        status: projectDisplayStatus(
          { progressCachedBp: project.progressBp, endsAt: project.endsAt },
          now,
        ),
        fromIndicator,
        href: projectHref,
      });
      if (!opts.showTasks) continue;
      if (project.tasks.length === 0) {
        rows.push({ kind: 'no-tasks', key: `nt-${project.id}`, projectId: project.id });
        continue;
      }
      for (const task of project.tasks) {
        rows.push({
          kind: 'task',
          key: `t-${task.id}`,
          objectiveId: objective.id,
          task,
          informative: fromIndicator,
          href: `${projectHref}#task-${task.id}`,
        });
      }
    }
  }
  return rows;
}

/** Alterna un id en el set de colapsados (inmutable). */
export function toggleId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Si todos están colapsados los expande; si no, colapsa todos. */
export function toggleAll(data: PlanningGanttDto, collapsed: ReadonlySet<string>): Set<string> {
  const ids = data.objectives.map((o) => o.id);
  return collapsed.size === ids.length ? new Set() : new Set(ids);
}
