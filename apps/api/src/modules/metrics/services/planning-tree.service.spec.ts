/**
 * PlanningTreeService: árbol de planificación (SPEC §5.2/§5.3, RN-P10). La agregación es la REAL de `okr-domain`;
 * solo se fakean los puertos (objetivos, unidades, ejes), el período y el servicio de estado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PlanningTreeService } from './planning-tree.service.js';

const ORG = 'org-1';
const NOW = new Date('2027-08-20T15:30:00Z');

const period = { findFirst: vi.fn() };
const progressReader = { readPeriodObjectivesProgress: vi.fn() };
const unitReader = { listLiveOrgUnits: vi.fn() };
const axisReader = { findActivePlanStructure: vi.fn() };
const statusService = { getObjectivesStatusSummaries: vi.fn() };

function build(): PlanningTreeService {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new PlanningTreeService(
    { scoped: { period } } as any,
    statusService as any,
    progressReader as any,
    unitReader as any,
    axisReader as any,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const unit = (
  id: string,
  parentId: string | null,
  kind: 'central' | 'ministry' | 'area',
  order = 0,
) => ({
  id,
  parentId,
  kind,
  name: id,
  order,
});
const reading = (
  id: string,
  orgUnitId: string,
  axisId: string | null,
  result: number,
  execution: number,
) => ({
  id,
  title: `Obj ${id}`,
  orgUnitId,
  axisId,
  resultProgressBp: result,
  executionProgressBp: execution,
  plannedExecutionProgressBp: 0,
});
const status = (
  result: number,
  resultDev: number | null,
  execution: number,
  execDev: number,
  pending: number,
) => ({
  result: {
    progressBp: result,
    deviationBp: resultDev,
    semaphore: resultDev === null ? null : resultDev >= -1000 ? 'green' : 'yellow',
    pendingBucketsCount: pending,
  },
  execution: {
    progressBp: execution,
    plannedBp: execution - execDev,
    deviationBp: execDev,
    semaphore: 'green',
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  period.findFirst.mockResolvedValue({ id: 'p-1' });
  unitReader.listLiveOrgUnits.mockResolvedValue([
    unit('central', null, 'central'),
    unit('min-a', 'central', 'ministry', 0),
    unit('area-a1', 'min-a', 'area'),
    unit('min-b', 'central', 'ministry', 1),
  ]);
  axisReader.findActivePlanStructure.mockResolvedValue({
    id: 'plan-1',
    title: 'Plan',
    axes: [
      { id: 'ax-2', name: 'B', order: 1 },
      { id: 'ax-1', name: 'A', order: 0 },
    ],
  });
  progressReader.readPeriodObjectivesProgress.mockResolvedValue([
    reading('o1', 'min-a', 'ax-1', 6000, 1000),
    reading('o2', 'area-a1', 'ax-1', 2000, 3000),
    reading('o3', 'min-b', null, 0, 0),
    reading('o4', 'min-b', 'ax-2', 1000, 1000),
  ]);
  statusService.getObjectivesStatusSummaries.mockImplementation(
    async (_org: string, rs: Array<{ id: string }>) => {
      const all: Record<string, ReturnType<typeof status>> = {
        o1: status(6000, -500, 1000, -200, 1),
        o2: status(2000, -3000, 3000, -2000, 2),
        o3: status(0, null, 0, 0, 0),
        o4: status(1000, null, 1000, 0, 0),
      };
      return new Map(rs.map((r) => [r.id, all[r.id]]));
    },
  );
});

describe('getPlanningTree', () => {
  it('agrega por plan, eje y unidad (subárbol) con promedio simple de objetivos, por lectura', async () => {
    const tree = await build().getPlanningTree(ORG, { periodId: 'p-1' }, NOW);

    expect(tree.plan.aggregate.objectivesCount).toBe(4);
    expect(tree.plan.aggregate.result.progressBp).toBe(2250); // (6000+2000+0+1000)/4
    expect(tree.plan.aggregate.execution.progressBp).toBe(1250); // (1000+3000+0+1000)/4
    expect(tree.plan.aggregate.result.pendingBucketsCount).toBe(3);
    // desvío de resultado: solo los medibles (o1, o2) -> (-500 + -3000)/2 = -1750
    expect(tree.plan.aggregate.result.deviationBp).toBe(-1750);
    expect(tree.plan.aggregate.result.semaphore).toBe('yellow');

    // ejes por order, con su desglose por unidad
    expect(tree.axes.map((a) => a.id)).toEqual(['ax-1', 'ax-2']);
    const ax1 = tree.axes[0];
    expect(ax1?.objectiveIds).toEqual(['o1', 'o2']);
    expect(ax1?.aggregate.result.progressBp).toBe(4000);
    expect(ax1?.units.map((u) => u.orgUnitId)).toEqual(['min-a', 'area-a1']);
    expect(tree.axes[1]?.units.map((u) => u.orgUnitId)).toEqual(['min-b']);

    // sin eje
    expect(tree.withoutAxis.objectiveIds).toEqual(['o3']);

    // árbol de unidades completo; el subárbol de min-a incluye a area-a1
    const central = tree.units[0];
    expect(central?.children.map((c) => c.id)).toEqual(['min-a', 'min-b']);
    const minA = central?.children[0];
    expect(minA?.aggregate.objectivesCount).toBe(2);
    expect(minA?.aggregate.result.progressBp).toBe(4000);
    expect(minA?.directAggregate.objectivesCount).toBe(1);
    expect(minA?.children[0]?.id).toBe('area-a1');
    expect(central?.aggregate.objectivesCount).toBe(4);

    expect(tree.objectives.map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(tree.objectives[0]?.execution.deviationBp).toBe(-200);
  });

  it('incluye las unidades y ejes sin objetivos, con agregado vacío (null, no 0)', async () => {
    progressReader.readPeriodObjectivesProgress.mockResolvedValue([]);
    statusService.getObjectivesStatusSummaries.mockResolvedValue(new Map());
    const tree = await build().getPlanningTree(ORG, { periodId: 'p-1' }, NOW);
    expect(tree.axes).toHaveLength(2);
    expect(tree.axes[0]?.aggregate.result.progressBp).toBeNull();
    expect(tree.units[0]?.children).toHaveLength(2);
    expect(tree.plan.aggregate.objectivesCount).toBe(0);
    expect(tree.withoutAxis.aggregate.objectivesCount).toBe(0);
  });

  it('el estado se pide una sola vez para todos los objetivos (sin N+1) y por organización', async () => {
    await build().getPlanningTree(ORG, { periodId: 'p-1' }, NOW);
    expect(statusService.getObjectivesStatusSummaries).toHaveBeenCalledTimes(1);
    expect(progressReader.readPeriodObjectivesProgress).toHaveBeenCalledWith(ORG, 'p-1', NOW);
    expect(period.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'p-1', organizationId: ORG }),
      }),
    );
  });

  it('filtro por eje: solo sus objetivos y solo ese eje; el plan agrega lo filtrado', async () => {
    const tree = await build().getPlanningTree(ORG, { periodId: 'p-1', axisId: 'ax-1' }, NOW);
    expect(tree.axes.map((a) => a.id)).toEqual(['ax-1']);
    expect(tree.objectives.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(tree.plan.aggregate.objectivesCount).toBe(2);
    expect(tree.withoutAxis.aggregate.objectivesCount).toBe(0);
    expect(tree.filters).toEqual({ axisId: 'ax-1', orgUnitId: null });
  });

  it('filtro por unidad: esa unidad (con descendientes) es la única raíz', async () => {
    const tree = await build().getPlanningTree(ORG, { periodId: 'p-1', orgUnitId: 'min-a' }, NOW);
    expect(tree.units.map((u) => u.id)).toEqual(['min-a']);
    expect(tree.units[0]?.children.map((c) => c.id)).toEqual(['area-a1']);
    expect(tree.objectives.map((o) => o.id)).toEqual(['o1', 'o2']);
  });

  it('un eje de un plan archivado cuenta como "sin eje"', async () => {
    progressReader.readPeriodObjectivesProgress.mockResolvedValue([
      reading('o3', 'min-b', 'ax-viejo', 0, 0),
    ]);
    const tree = await build().getPlanningTree(ORG, { periodId: 'p-1' }, NOW);
    expect(tree.withoutAxis.objectiveIds).toEqual(['o3']);
    expect(tree.objectives[0]?.axisId).toBeNull();
  });

  it('sin plan activo: plan sin id y sin ejes', async () => {
    axisReader.findActivePlanStructure.mockResolvedValue(null);
    const tree = await build().getPlanningTree(ORG, { periodId: 'p-1' }, NOW);
    expect(tree.plan.id).toBeNull();
    expect(tree.axes).toEqual([]);
  });

  it('sin periodId usa el período abierto de la organización', async () => {
    await build().getPlanningTree(ORG, {}, NOW);
    expect(period.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, status: 'open', deletedAt: null } }),
    );
  });

  it('sin periodId y sin período abierto: 404 OpenPeriodNotFound', async () => {
    period.findFirst.mockResolvedValueOnce(null);
    await expect(build().getPlanningTree(ORG, {}, NOW)).rejects.toThrow('OpenPeriodNotFound');
  });

  it('404 si el período, el eje o la unidad no existen en la organización', async () => {
    period.findFirst.mockResolvedValueOnce(null);
    await expect(build().getPlanningTree(ORG, { periodId: 'nope' }, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      build().getPlanningTree(ORG, { periodId: 'p-1', axisId: 'nope' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build().getPlanningTree(ORG, { periodId: 'p-1', orgUnitId: 'nope' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
