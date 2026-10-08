import { describe, it, expect, vi } from 'vitest';
import { PrismaOrgUnitHierarchy, PrismaOrgUnitLookup } from './core-contracts.module.js';

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

describe('ORG_UNIT_HIERARCHY', () => {
  const tree: Record<string, { id: string; parentId: string | null }> = {
    root: { id: 'root', parentId: null },
    min: { id: 'min', parentId: 'root' },
    area: { id: 'area', parentId: 'min' },
  };
  const build = () => {
    const findFirst = vi.fn(async ({ where }: { where: { id: string } }) => tree[where.id] ?? null);
    return { findFirst, hierarchy: new PrismaOrgUnitHierarchy({ raw: { orgUnit: { findFirst } } } as never) };
  };

  it('la misma unidad y sus descendientes pasan', async () => {
    const { hierarchy } = build();
    await expect(hierarchy.isSelfOrDescendant('org-1', 'min', 'min')).resolves.toBe(true);
    await expect(hierarchy.isSelfOrDescendant('org-1', 'min', 'area')).resolves.toBe(true);
    await expect(hierarchy.isSelfOrDescendant('org-1', 'root', 'area')).resolves.toBe(true);
  });

  it('un ancestro o una unidad hermana no pasan', async () => {
    const { hierarchy } = build();
    await expect(hierarchy.isSelfOrDescendant('org-1', 'area', 'min')).resolves.toBe(false);
    await expect(hierarchy.isSelfOrDescendant('org-1', 'area', 'root')).resolves.toBe(false);
  });

  it('unidad inexistente, borrada o de otra org -> false, y siempre filtra por organización', async () => {
    const { hierarchy, findFirst } = build();
    await expect(hierarchy.isSelfOrDescendant('org-1', 'min', 'ghost')).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'ghost', organizationId: 'org-1', deletedAt: null },
      select: { id: true, parentId: true },
    });
  });
});
