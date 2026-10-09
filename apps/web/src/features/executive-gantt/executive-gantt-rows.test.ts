import { describe, expect, it } from 'vitest';
import type {
  ObjectivePlanGanttDto,
  PlanningGanttDto,
  ProjectGanttDto,
} from '@gestion-publica/shared-types/okr';
import { buildGanttRows, toggleAll, toggleId } from './executive-gantt-rows';

const project = (
  id: string,
  mode: ProjectGanttDto['progressMode'],
  tasks = 1,
): ProjectGanttDto => ({
  id,
  title: id,
  orgUnitId: 'u1',
  orgUnitName: 'U1',
  progressBp: 5000,
  progressMode: mode,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  tasks: Array.from({ length: tasks }, (_, i) => ({
    id: `${id}-t${i}`,
    title: 't',
    status: 'in_progress' as const,
    progressBp: 1000,
    startsAt: '2026-02-01T00:00:00.000Z',
    endsAt: '2026-03-01T00:00:00.000Z',
  })),
});

const objective = (id: string, projects: ProjectGanttDto[]): ObjectivePlanGanttDto => ({
  id,
  title: id,
  orgUnitId: 'u1',
  orgUnitName: 'U1',
  orgUnitKind: 'area',
  axisId: null,
  axisName: null,
  startsAt: projects.length ? '2026-01-01T00:00:00.000Z' : null,
  endsAt: projects.length ? '2026-12-31T00:00:00.000Z' : null,
  result: { progressBp: 1000, deviationBp: null, semaphore: null, pendingBucketsCount: 0 },
  execution: { progressBp: 2000, plannedBp: 2000, deviationBp: 0, semaphore: 'green' },
  projects,
});

const data = (objectives: ObjectivePlanGanttDto[]): PlanningGanttDto => ({
  asOf: '2026-06-01T00:00:00.000Z',
  periodId: 'per',
  filters: { axisId: null, orgUnitId: null },
  objectives,
});

const kinds = (rows: ReturnType<typeof buildGanttRows>) => rows.map((r) => r.kind);

describe('buildGanttRows', () => {
  it('muestra objetivo y proyectos; las tareas solo si showTasks', () => {
    const d = data([objective('o1', [project('p1', 'from_tasks')])]);
    expect(kinds(buildGanttRows(d, { showTasks: false, collapsedIds: new Set() }))).toEqual([
      'objective',
      'project',
    ]);
    expect(kinds(buildGanttRows(d, { showTasks: true, collapsedIds: new Set() }))).toEqual([
      'objective',
      'project',
      'task',
    ]);
  });

  it('objetivo sin proyectos: fila "sin proyectos"', () => {
    const rows = buildGanttRows(data([objective('o1', [])]), {
      showTasks: true,
      collapsedIds: new Set(),
    });
    expect(kinds(rows)).toEqual(['objective', 'no-projects']);
  });

  it('proyecto sin tareas con showTasks: fila "sin tareas"', () => {
    const rows = buildGanttRows(data([objective('o1', [project('p1', 'from_tasks', 0)])]), {
      showTasks: true,
      collapsedIds: new Set(),
    });
    expect(kinds(rows)).toEqual(['objective', 'project', 'no-tasks']);
  });

  it('from_indicator marca el proyecto y sus tareas como informativas', () => {
    const rows = buildGanttRows(data([objective('o1', [project('p1', 'from_indicator')])]), {
      showTasks: true,
      collapsedIds: new Set(),
    });
    const p = rows.find((r) => r.kind === 'project');
    const t = rows.find((r) => r.kind === 'task');
    expect(p && p.kind === 'project' && p.fromIndicator).toBe(true);
    expect(t && t.kind === 'task' && t.informative).toBe(true);
  });

  it('un objetivo colapsado oculta sus hijos', () => {
    const d = data([objective('o1', [project('p1', 'from_tasks')]), objective('o2', [])]);
    const rows = buildGanttRows(d, { showTasks: true, collapsedIds: new Set(['o1']) });
    expect(kinds(rows)).toEqual(['objective', 'objective', 'no-projects']);
  });

  it('deriva el estado de presentación del proyecto desde asOf', () => {
    const late = { ...project('p1', 'from_tasks'), endsAt: '2026-03-01T00:00:00.000Z' };
    const rows = buildGanttRows(data([objective('o1', [late])]), {
      showTasks: false,
      collapsedIds: new Set(),
    });
    const p = rows.find((r) => r.kind === 'project');
    expect(p && p.kind === 'project' && p.status).toBe('overdue');
  });
});

describe('colapso', () => {
  it('toggleId alterna sin mutar', () => {
    const base = new Set(['a']);
    expect([...toggleId(base, 'b')].sort()).toEqual(['a', 'b']);
    expect([...toggleId(base, 'a')]).toEqual([]);
    expect([...base]).toEqual(['a']);
  });

  it('toggleAll colapsa todo y, si ya está todo colapsado, expande', () => {
    const d = data([objective('o1', []), objective('o2', [])]);
    expect([...toggleAll(d, new Set())].sort()).toEqual(['o1', 'o2']);
    expect(toggleAll(d, new Set(['o1', 'o2'])).size).toBe(0);
  });

  it('linkea el proyecto a su ficha y la tarea a su ancla dentro de ella', () => {
    const rows = buildGanttRows(data([objective('o1', [project('p1', 'from_tasks', 1)])]), {
      showTasks: true,
      collapsedIds: new Set(),
    });
    const hrefs = rows.flatMap((r) => ('href' in r ? [r.href] : []));
    expect(hrefs).toContain('/objectives/o1/projects/p1');
    expect(hrefs.some((h) => /^\/objectives\/o1\/projects\/p1#task-/.test(h))).toBe(true);
  });
});
