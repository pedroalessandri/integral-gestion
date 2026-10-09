/**
 * PlanningGanttService: Gantt Objetivo -> Proyecto -> Tarea (SPEC §5.7). Se fakean puertos, Prisma y el servicio
 * de estado; la derivación de fechas y estados es la real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PlanningGanttService } from './planning-gantt.service.js';

const ORG = 'org-1';
const NOW = new Date('2027-08-20T15:30:00Z');

const period = { findFirst: vi.fn() };
const project = { findMany: vi.fn() };
const task = { findMany: vi.fn() };
const progressReader = { readPeriodObjectivesProgress: vi.fn() };
const unitReader = { listLiveOrgUnits: vi.fn() };
const axisReader = { findActivePlanStructure: vi.fn() };
const statusService = { getObjectivesStatusSummaries: vi.fn() };

function build(): PlanningGanttService {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new PlanningGanttService(
    { scoped: { period, project, task } } as any,
    statusService as any,
    progressReader as any,
    unitReader as any,
    axisReader as any,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const unit = (id: string, parentId: string | null, kind: 'central' | 'ministry' | 'area') => ({
  id,
  parentId,
  kind,
  name: `U ${id}`,
  order: 0,
});
const reading = (id: string, orgUnitId: string | null, axisId: string | null) => ({
  id,
  title: `Obj ${id}`,
  orgUnitId,
  axisId,
  resultProgressBp: 1000,
  executionProgressBp: 2000,
  plannedExecutionProgressBp: 0,
});
const status = {
  result: { progressBp: 1000, deviationBp: -500, semaphore: 'green', pendingBucketsCount: 2, indicators: [] },
  execution: { progressBp: 2000, plannedBp: 3000, deviationBp: -1000, semaphore: 'yellow' },
};
const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  period.findFirst.mockResolvedValue({ id: 'p-1' });
  unitReader.listLiveOrgUnits.mockResolvedValue([
    unit('c', null, 'central'),
    unit('a', 'c', 'ministry'),
    unit('b', 'c', 'ministry'),
  ]);
  axisReader.findActivePlanStructure.mockResolvedValue({
    id: 'plan',
    title: 'Plan',
    axes: [{ id: 'ax1', name: 'Movilidad', order: 0 }],
  });
  progressReader.readPeriodObjectivesProgress.mockResolvedValue([
    reading('o1', 'a', 'ax1'),
    reading('o2', 'b', null),
  ]);
  statusService.getObjectivesStatusSummaries.mockImplementation(
    async (_org: string, rs: Array<{ id: string }>) => new Map(rs.map((r) => [r.id, status])),
  );
  project.findMany.mockResolvedValue([
    {
      id: 'pr1',
      objectiveId: 'o1',
      orgUnitId: 'a',
      title: 'Proyecto 1',
      progressCachedBp: 4000,
      progressMode: 'from_tasks',
      startsAt: d('2027-03-01'),
      endsAt: d('2027-06-30'),
    },
    {
      id: 'pr2',
      objectiveId: 'o1',
      orgUnitId: 'a',
      title: 'Proyecto 2',
      progressCachedBp: 0,
      progressMode: 'from_tasks',
      startsAt: d('2027-05-01'),
      endsAt: d('2027-11-30'),
    },
  ]);
  task.findMany.mockResolvedValue([
    { id: 't1', projectId: 'pr1', title: 'T1', progressBp: 10000, startsAt: d('2027-03-01'), endsAt: d('2027-04-01') },
    { id: 't2', projectId: 'pr1', title: 'T2', progressBp: 500, startsAt: d('2027-04-01'), endsAt: d('2027-05-01') },
  ]);
});

describe('PlanningGanttService', () => {
  it('arma objetivo -> proyecto -> tarea, con fechas derivadas de los proyectos y las dos lecturas separadas', async () => {
    const res = await build().getPlanningGantt(ORG, {}, NOW);
    expect(res.periodId).toBe('p-1');
    expect(res.objectives.map((o) => o.id)).toEqual(['o1', 'o2']);

    const o1 = res.objectives[0];
    expect(o1).toMatchObject({
      orgUnitId: 'a',
      orgUnitName: 'U a',
      axisId: 'ax1',
      axisName: 'Movilidad',
      startsAt: '2027-03-01T00:00:00.000Z',
      endsAt: '2027-11-30T00:00:00.000Z',
      result: { progressBp: 1000, deviationBp: -500, semaphore: 'green', pendingBucketsCount: 2 },
      execution: { progressBp: 2000, plannedBp: 3000, deviationBp: -1000, semaphore: 'yellow' },
    });
    expect(o1).not.toHaveProperty('progressBp');
    expect(o1?.projects[0]).toMatchObject({ id: 'pr1', progressBp: 4000, progressMode: 'from_tasks', orgUnitName: 'U a' });
    expect(o1?.projects[0]?.tasks.map((t) => [t.id, t.status])).toEqual([
      ['t1', 'done'],
      ['t2', 'overdue'],
    ]);
    expect(o1?.projects[1]?.tasks).toEqual([]);
  });

  it('un objetivo sin proyectos se incluye con fechas null', async () => {
    const o2 = (await build().getPlanningGantt(ORG, {}, NOW)).objectives[1];
    expect(o2).toMatchObject({ id: 'o2', startsAt: null, endsAt: null, projects: [], axisId: null });
  });

  it('carga proyectos y tareas en lote (una query por tipo) y siempre filtra por organización', async () => {
    await build().getPlanningGantt(ORG, {}, NOW);
    expect(project.findMany).toHaveBeenCalledTimes(1);
    expect(task.findMany).toHaveBeenCalledTimes(1);
    expect(project.findMany.mock.calls[0]?.[0].where).toMatchObject({ organizationId: ORG, objectiveId: { in: ['o1', 'o2'] } });
    expect(task.findMany.mock.calls[0]?.[0].where).toMatchObject({ organizationId: ORG, deletedAt: null });
  });

  it('filtra por eje y por subárbol de unidad', async () => {
    const svc = build();
    expect((await svc.getPlanningGantt(ORG, { axisId: 'ax1' }, NOW)).objectives.map((o) => o.id)).toEqual(['o1']);
    expect((await svc.getPlanningGantt(ORG, { orgUnitId: 'b' }, NOW)).objectives.map((o) => o.id)).toEqual(['o2']);
    expect((await svc.getPlanningGantt(ORG, { orgUnitId: 'c' }, NOW)).objectives).toHaveLength(2);
  });

  it('sin objetivos no consulta proyectos ni tareas', async () => {
    progressReader.readPeriodObjectivesProgress.mockResolvedValue([]);
    const res = await build().getPlanningGantt(ORG, {}, NOW);
    expect(res.objectives).toEqual([]);
    expect(project.findMany).not.toHaveBeenCalled();
    expect(task.findMany).not.toHaveBeenCalled();
  });

  it('404 con período, eje o unidad inexistentes y sin período abierto', async () => {
    const svc = build();
    await expect(svc.getPlanningGantt(ORG, { axisId: 'nope' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getPlanningGantt(ORG, { orgUnitId: 'nope' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    period.findFirst.mockResolvedValue(null);
    await expect(svc.getPlanningGantt(ORG, {}, NOW)).rejects.toThrow(/OpenPeriodNotFound/);
    await expect(svc.getPlanningGantt(ORG, { periodId: 'x' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
