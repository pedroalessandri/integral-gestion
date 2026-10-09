import { describe, expect, it } from 'vitest';
import {
  hasActiveFilters,
  parseFilters,
  resolvePeriodId,
  toHref,
  toSearchParams,
} from './planning-tree-filters';

describe('parseFilters', () => {
  it('lee los filtros y usa la vista por ejes por defecto', () => {
    expect(parseFilters({ periodId: 'p1', axisId: 'a1' })).toEqual({
      periodId: 'p1',
      axisId: 'a1',
      orgUnitId: null,
      view: 'axes',
    });
  });

  it('ignora vacíos, toma el primer valor de repetidos y descarta vistas inválidas', () => {
    expect(parseFilters({ periodId: ['p1', 'p2'], axisId: '  ', orgUnitId: 'u1', view: 'otra' })).toEqual({
      periodId: 'p1',
      axisId: null,
      orgUnitId: 'u1',
      view: 'axes',
    });
    expect(parseFilters({ view: 'units' }).view).toBe('units');
  });
});

describe('toSearchParams / toHref', () => {
  it('omite lo vacío y la vista por defecto', () => {
    const f = { periodId: 'p1', axisId: null, orgUnitId: null, view: 'axes' as const };
    expect(toSearchParams(f).toString()).toBe('periodId=p1');
    expect(toHref('/planning', { ...f, periodId: null })).toBe('/planning');
  });

  it('es inverso de parseFilters', () => {
    const f = { periodId: 'p1', axisId: 'a1', orgUnitId: 'u1', view: 'units' as const };
    const parsed = parseFilters(Object.fromEntries(toSearchParams(f)));
    expect(parsed).toEqual(f);
  });
});

describe('resolvePeriodId', () => {
  const periods = [
    { id: 'c1', status: 'closed' as const },
    { id: 'o1', status: 'open' as const },
  ];
  it('respeta el período pedido', () => expect(resolvePeriodId('c1', periods)).toBe('c1'));
  it('por defecto usa el abierto', () => expect(resolvePeriodId(null, periods)).toBe('o1'));
  it('sin abierto usa el primer cerrado', () => expect(resolvePeriodId(null, [periods[0]!])).toBe('c1'));
  it('sin períodos devuelve null', () => expect(resolvePeriodId(null, [])).toBeNull());
});

describe('hasActiveFilters', () => {
  it('solo cuenta eje y unidad', () => {
    expect(hasActiveFilters({ periodId: 'p', axisId: null, orgUnitId: null, view: 'units' })).toBe(false);
    expect(hasActiveFilters({ periodId: 'p', axisId: 'a', orgUnitId: null, view: 'axes' })).toBe(true);
  });
});
