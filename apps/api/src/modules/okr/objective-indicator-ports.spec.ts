/** Puerto OBJECTIVE_LOOKUP de `okr` para `metrics` (ADR-0009 D5). */
import { describe, it, expect, vi } from 'vitest';
import { PrismaObjectiveLookup } from './okr-contracts.module.js';

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
