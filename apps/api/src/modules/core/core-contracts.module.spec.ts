import { describe, it, expect, vi } from 'vitest';
import { PrismaOrgUnitLookup } from './core-contracts.module.js';

describe('ORG_UNIT_LOOKUP', () => {
  it('devuelve id y kind de la unidad viva, filtrando por organización', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'u1', kind: 'area' });
    const lookup = new PrismaOrgUnitLookup({ raw: { orgUnit: { findFirst } } } as never);

    await expect(lookup.findLiveOrgUnit('org-1', 'u1')).resolves.toEqual({ id: 'u1', kind: 'area' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', organizationId: 'org-1', deletedAt: null },
      select: { id: true, kind: true },
    });
  });

  it('unidad inexistente, borrada o de otra org -> null', async () => {
    const lookup = new PrismaOrgUnitLookup({
      raw: { orgUnit: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as never);
    await expect(lookup.findLiveOrgUnit('org-1', 'u9')).resolves.toBeNull();
  });
});
