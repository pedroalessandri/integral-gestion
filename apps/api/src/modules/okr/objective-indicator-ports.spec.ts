/** Puerto OBJECTIVE_LOOKUP de `okr` para `metrics` (ADR-0009 D5). */
import { describe, it, expect, vi } from 'vitest';
import { PrismaObjectiveLookup, PrismaObjectiveProgressReader } from './okr-contracts.module.js';

const ORG = 'org-1';

describe('PrismaObjectiveLookup', () => {
  it('filtra siempre por organizationId y objetivos vivos', async () => {
    const objective = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'obj-1',
        periodId: 'p-1',
        period: { id: 'p-1', code: '2027', status: 'open' },
      }),
      findMany: vi.fn().mockResolvedValue([{ id: 'obj-1' }]),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookup = new PrismaObjectiveLookup({ raw: { objective } } as any);

    expect(await lookup.findLiveObjective(ORG, 'obj-1')).toEqual({
      id: 'obj-1',
      periodId: 'p-1',
      period: { id: 'p-1', code: '2027', status: 'open' },
    });
    expect(objective.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'obj-1', organizationId: ORG, deletedAt: null } }),
    );

    expect(await lookup.filterLiveObjectiveIds(ORG, ['obj-1', 'obj-2'])).toEqual(['obj-1']);
    expect(objective.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['obj-1', 'obj-2'] }, organizationId: ORG, deletedAt: null } }),
    );
    expect(await lookup.filterLiveObjectiveIds(ORG, [])).toEqual([]);
  });

  it('objetivo inexistente -> null (el service que valida lanza 404)', async () => {
    const objective = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookup = new PrismaObjectiveLookup({ raw: { objective } } as any);
    expect(await lookup.findLiveObjective(ORG, 'nope')).toBeNull();
  });
});

describe('PrismaObjectiveProgressReader', () => {
  const at = new Date('2027-01-06T00:00:00Z');
  const task = { startsAt: new Date('2027-01-01T00:00:00Z'), endsAt: new Date('2027-01-11T00:00:00Z'), weightBp: null };

  it('devuelve los cachés y el planificado de okr-domain, filtrando siempre por organizationId', async () => {
    const objective = {
      findFirst: vi.fn().mockResolvedValue({ resultProgressCachedBp: 3000, executionProgressCachedBp: 4000 }),
    };
    const project = { findMany: vi.fn().mockResolvedValue([{ weightBp: null, tasks: [task] }, { weightBp: null, tasks: [] }]) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = new PrismaObjectiveProgressReader({ raw: { objective, project } } as any);

    // Proyecto 1 planificado al 50 % y proyecto 2 sin tareas (0): media simple 25 %.
    expect(await reader.readObjectiveProgress(ORG, 'obj-1', at)).toEqual({
      resultProgressBp: 3000,
      executionProgressBp: 4000,
      plannedExecutionProgressBp: 2500,
    });
    expect(objective.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'obj-1', organizationId: ORG, deletedAt: null } }),
    );
    expect(project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { objectiveId: 'obj-1', organizationId: ORG, deletedAt: null } }),
    );
  });

  it('objetivo inexistente o de otra org -> null, sin leer proyectos', async () => {
    const objective = { findFirst: vi.fn().mockResolvedValue(null) };
    const project = { findMany: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = new PrismaObjectiveProgressReader({ raw: { objective, project } } as any);
    expect(await reader.readObjectiveProgress(ORG, 'nope', at)).toBeNull();
    expect(project.findMany).not.toHaveBeenCalled();
  });
});
