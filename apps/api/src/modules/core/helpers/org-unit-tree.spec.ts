import { describe, it, expect } from 'vitest';
import { canBeChildOf, depthOf, indexUnits, isSelfOrDescendant, subtreeHeight, MAX_ORG_UNIT_DEPTH } from './org-unit-tree.js';

// root(1) -> a(2) -> a1(3) -> a11(4);  root -> b(2)
const units = [
  { id: 'root', parentId: null },
  { id: 'a', parentId: 'root' },
  { id: 'a1', parentId: 'a' },
  { id: 'a11', parentId: 'a1' },
  { id: 'b', parentId: 'root' },
];
const index = indexUnits(units);

describe('org-unit-tree', () => {
  it('MAX_ORG_UNIT_DEPTH es 4', () => {
    expect(MAX_ORG_UNIT_DEPTH).toBe(4);
  });

  it('depthOf cuenta la raíz como nivel 1', () => {
    expect(depthOf(index, 'root')).toBe(1);
    expect(depthOf(index, 'b')).toBe(2);
    expect(depthOf(index, 'a11')).toBe(4);
  });

  it('subtreeHeight incluye la propia unidad', () => {
    expect(subtreeHeight(units, 'a11')).toBe(1);
    expect(subtreeHeight(units, 'a')).toBe(3);
    expect(subtreeHeight(units, 'root')).toBe(4);
  });

  it('isSelfOrDescendant detecta ciclos potenciales', () => {
    expect(isSelfOrDescendant(index, 'a', 'a')).toBe(true);
    expect(isSelfOrDescendant(index, 'a', 'a11')).toBe(true);
    expect(isSelfOrDescendant(index, 'a', 'b')).toBe(false);
    expect(isSelfOrDescendant(index, 'a11', 'a')).toBe(false);
  });

  it('no se cuelga ante datos con ciclo', () => {
    const cyc = indexUnits([
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' },
    ]);
    expect(depthOf(cyc, 'x')).toBe(2);
    expect(isSelfOrDescendant(cyc, 'z', 'x')).toBe(false);
  });

  it('canBeChildOf respeta la jerarquía de kinds', () => {
    expect(canBeChildOf('central', 'ministry')).toBe(true);
    expect(canBeChildOf('central', 'area')).toBe(true);
    expect(canBeChildOf('central', 'central')).toBe(false);
    expect(canBeChildOf('ministry', 'ministry')).toBe(true);
    expect(canBeChildOf('ministry', 'area')).toBe(true);
    expect(canBeChildOf('ministry', 'central')).toBe(false);
    expect(canBeChildOf('area', 'area')).toBe(true);
    expect(canBeChildOf('area', 'ministry')).toBe(false);
    expect(canBeChildOf('area', 'central')).toBe(false);
    expect(canBeChildOf('bogus', 'area')).toBe(false);
  });
});
