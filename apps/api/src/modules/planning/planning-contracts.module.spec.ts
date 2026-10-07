import { describe, it, expect, vi } from 'vitest';
import { PrismaActiveAxisLookup } from './planning-contracts.module.js';

describe('ACTIVE_AXIS_LOOKUP', () => {
  it('exige eje vivo, de la org y de un plan activo de la misma org', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const lookup = new PrismaActiveAxisLookup({ raw: { axis: { count } } } as never);

    await expect(lookup.isAxisInActivePlan('org-1', 'axis-1')).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: {
        id: 'axis-1',
        organizationId: 'org-1',
        deletedAt: null,
        strategicPlan: { organizationId: 'org-1', status: 'active' },
      },
    });
  });

  it('eje borrado, de otra org o de un plan archivado (count 0) -> false', async () => {
    const lookup = new PrismaActiveAxisLookup({ raw: { axis: { count: vi.fn().mockResolvedValue(0) } } } as never);
    await expect(lookup.isAxisInActivePlan('org-1', 'axis-x')).resolves.toBe(false);
  });
});
