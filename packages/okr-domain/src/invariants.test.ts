import { describe, it, expect } from 'vitest';
import { validateWeightSumInvariant, projectSumAfterDelete } from './invariants';

describe('validateWeightSumInvariant', () => {
  it('returns { ok: true } when weights sum to 10000', () => {
    const result = validateWeightSumInvariant([
      { weightBp: 4000 },
      { weightBp: 6000 },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } with actual and expected when sum is 9999', () => {
    const result = validateWeightSumInvariant([
      { weightBp: 4000 },
      { weightBp: 5999 },
    ]);
    expect(result).toEqual({ ok: false, actual: 9999, expected: 10000 });
  });

  it('returns { ok: true } for empty items when expected=0', () => {
    const result = validateWeightSumInvariant([], 0);
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } for empty items with default expected=10000', () => {
    const result = validateWeightSumInvariant([]);
    expect(result).toEqual({ ok: false, actual: 0, expected: 10000 });
  });

  it('throws RangeError for negative weightBp', () => {
    expect(() => validateWeightSumInvariant([{ weightBp: -1 }, { weightBp: 10001 }])).toThrow(
      RangeError,
    );
  });

  it('throws RangeError for weightBp > 10000', () => {
    expect(() => validateWeightSumInvariant([{ weightBp: 10001 }])).toThrow(RangeError);
  });

  it('throws RangeError for non-integer weightBp', () => {
    expect(() => validateWeightSumInvariant([{ weightBp: 5000.5 }, { weightBp: 4999.5 }])).toThrow(
      RangeError,
    );
  });

  it('returns { ok: true } for a single item when expected matches its weight', () => {
    const result = validateWeightSumInvariant([{ weightBp: 10000 }]);
    expect(result).toEqual({ ok: true });
  });
});

describe('projectSumAfterDelete', () => {
  it('returns the sum of remaining siblings when id is found', () => {
    const result = projectSumAfterDelete(
      [
        { id: 'a', weightBp: 4000 },
        { id: 'b', weightBp: 6000 },
      ],
      'a',
    );
    expect(result).toBe(6000);
  });

  it('throws when toDeleteId is not in siblings', () => {
    expect(() =>
      projectSumAfterDelete(
        [
          { id: 'a', weightBp: 4000 },
          { id: 'b', weightBp: 6000 },
        ],
        'zzz',
      ),
    ).toThrow('toDeleteId');
  });

  it('returns 0 when there is only one sibling and it is deleted', () => {
    const result = projectSumAfterDelete([{ id: 'solo', weightBp: 10000 }], 'solo');
    expect(result).toBe(0);
  });

  it('removes only the first occurrence when there are duplicates ids', () => {
    const result = projectSumAfterDelete(
      [
        { id: 'dup', weightBp: 3000 },
        { id: 'dup', weightBp: 3000 },
        { id: 'c', weightBp: 4000 },
      ],
      'dup',
    );
    // First match (index 0) is removed; remaining: 3000 + 4000 = 7000
    expect(result).toBe(7000);
  });

  it('throws RangeError for invalid weightBp', () => {
    expect(() =>
      projectSumAfterDelete([{ id: 'a', weightBp: -100 }], 'a'),
    ).toThrow(RangeError);
  });
});
