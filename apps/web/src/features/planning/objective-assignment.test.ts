import { describe, expect, it } from 'vitest';
import { assignmentForCreate, assignmentForUpdate, hasUnit } from './objective-assignment';

describe('hasUnit', () => {
  it('exige una unidad no vacía (RN-P3)', () => {
    expect(hasUnit({ orgUnitId: null, axisId: null })).toBe(false);
    expect(hasUnit({ orgUnitId: '', axisId: null })).toBe(false);
    expect(hasUnit({ orgUnitId: 'u1', axisId: null })).toBe(true);
  });
});

describe('assignmentForCreate', () => {
  it('siempre manda la unidad y omite el eje vacío', () => {
    expect(assignmentForCreate({ orgUnitId: 'u1', axisId: null })).toEqual({ orgUnitId: 'u1' });
    expect(assignmentForCreate({ orgUnitId: 'u1', axisId: 'a1' })).toEqual({ orgUnitId: 'u1', axisId: 'a1' });
  });
});

describe('assignmentForUpdate', () => {
  it('manda solo lo que cambió y permite quitar el eje', () => {
    const initial = { orgUnitId: 'u1', axisId: 'a1' };
    expect(assignmentForUpdate(initial, initial)).toEqual({});
    expect(assignmentForUpdate(initial, { orgUnitId: 'u2', axisId: null })).toEqual({ orgUnitId: 'u2', axisId: null });
  });
});
