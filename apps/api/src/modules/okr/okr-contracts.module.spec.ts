import { describe, it, expect, vi } from 'vitest';
import { transactionContextStorage } from '../audit/index.js';
import {
  PrismaObjectiveAxisCounter,
  PrismaObjectiveAxisUnassigner,
  PrismaObjectiveOrgUnitCounter,
} from './okr-contracts.module.js';

describe('contratos de okr', () => {
  it('ORG_UNIT_OBJECTIVE_COUNTER cuenta objetivos vivos de la unidad dentro de la org', async () => {
    const count = vi.fn().mockResolvedValue(3);
    const counter = new PrismaObjectiveOrgUnitCounter({ raw: { objective: { count } } } as never);

    await expect(counter.countLiveObjectivesByOrgUnit('org-1', 'unit-1')).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', orgUnitId: 'unit-1', deletedAt: null },
    });
  });

  it('AXIS_OBJECTIVE_COUNTER cuenta objetivos vivos del eje dentro de la org', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const counter = new PrismaObjectiveAxisCounter({ raw: { objective: { count } } } as never);

    await expect(counter.countLiveObjectivesByAxis('org-1', 'axis-1')).resolves.toBe(0);
    expect(count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', axisId: 'axis-1', deletedAt: null },
    });
  });

  describe('AXIS_OBJECTIVE_UNASSIGNER', () => {
    it('deja axisId en null en los objetivos del eje y emite objective.updated por cada uno', async () => {
      const tx = {
        objective: {
          findMany: vi.fn().mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };
      const emit = vi.fn().mockResolvedValue(undefined);
      const unassigner = new PrismaObjectiveAxisUnassigner({ emit } as never);

      const ids = await transactionContextStorage.run(tx as never, () =>
        unassigner.unassignAxisFromObjectives('org-1', 'axis-1'),
      );

      expect(ids).toEqual(['o1', 'o2']);
      expect(tx.objective.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', axisId: 'axis-1', deletedAt: null },
        select: { id: true },
      });
      expect(tx.objective.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['o1', 'o2'] }, organizationId: 'org-1' },
        data: { axisId: null },
      });
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenCalledWith({
        action: 'objective.updated',
        entityType: 'okr.objective',
        entityId: 'o1',
        diff: { before: { axisId: 'axis-1' }, after: { axisId: null } },
      });
    });

    it('sin objetivos no escribe ni audita', async () => {
      const tx = { objective: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() } };
      const emit = vi.fn();
      const unassigner = new PrismaObjectiveAxisUnassigner({ emit } as never);

      const ids = await transactionContextStorage.run(tx as never, () =>
        unassigner.unassignAxisFromObjectives('org-1', 'axis-1'),
      );

      expect(ids).toEqual([]);
      expect(tx.objective.updateMany).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('sin transacción activa falla', async () => {
      const unassigner = new PrismaObjectiveAxisUnassigner({ emit: vi.fn() } as never);
      await expect(unassigner.unassignAxisFromObjectives('org-1', 'axis-1')).rejects.toThrow(/transaction/i);
    });
  });
});
