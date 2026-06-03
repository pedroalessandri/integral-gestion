import { describe, it, expect } from 'vitest';
import { computeKrProgress, computeObjectiveProgress, WeightSumInvariantError } from './cascade';

describe('computeKrProgress', () => {
  it('returns 0 for empty tasks array (RN-07)', () => {
    expect(computeKrProgress([])).toBe(0);
  });

  it('Worked Example 1: KR at 82.00% (8200 bp) from 3 tasks', () => {
    // 3000 * 10000 + 5000 * 7000 + 2000 * 8500 = 30_000_000 + 35_000_000 + 17_000_000 = 82_000_000
    // 82_000_000 / 10_000 = 8200
    expect(
      computeKrProgress([
        { weightBp: 3000, progressBp: 10000 },
        { weightBp: 5000, progressBp: 7000 },
        { weightBp: 2000, progressBp: 8500 },
      ]),
    ).toBe(8200);
  });

  it('returns 10000 when all tasks are at 100% progress', () => {
    expect(
      computeKrProgress([
        { weightBp: 5000, progressBp: 10000 },
        { weightBp: 5000, progressBp: 10000 },
      ]),
    ).toBe(10000);
  });

  it('returns 0 when all tasks are at 0% progress', () => {
    expect(
      computeKrProgress([
        { weightBp: 3000, progressBp: 0 },
        { weightBp: 7000, progressBp: 0 },
      ]),
    ).toBe(0);
  });

  it('throws WeightSumInvariantError when weights do not sum to 10000', () => {
    expect(() =>
      computeKrProgress([
        { weightBp: 3000, progressBp: 5000 },
        { weightBp: 3000, progressBp: 5000 },
      ]),
    ).toThrow(WeightSumInvariantError);
  });

  it('throws RangeError when progressBp is out of range', () => {
    expect(() =>
      computeKrProgress([
        { weightBp: 5000, progressBp: 10001 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it('throws RangeError when weightBp is out of range', () => {
    expect(() =>
      computeKrProgress([
        { weightBp: 20000, progressBp: 5000 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it('throws RangeError when weightBp is negative', () => {
    expect(() =>
      computeKrProgress([
        { weightBp: -1, progressBp: 5000 },
        { weightBp: 10001, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });
});

describe('computeObjectiveProgress', () => {
  it('returns 0 for empty krs array (RN-08)', () => {
    expect(computeObjectiveProgress([])).toBe(0);
  });

  it('Worked Example 2: Objective at 31.50% (3150 bp) from 2 KRs', () => {
    // 5000 * 2000 + 5000 * 4300 = 10_000_000 + 21_500_000 = 31_500_000
    // 31_500_000 / 10_000 = 3150
    expect(
      computeObjectiveProgress([
        { weightBp: 5000, progressBp: 2000 },
        { weightBp: 5000, progressBp: 4300 },
      ]),
    ).toBe(3150);
  });

  it('returns 10000 when all KRs are at 100% progress', () => {
    expect(
      computeObjectiveProgress([
        { weightBp: 4000, progressBp: 10000 },
        { weightBp: 6000, progressBp: 10000 },
      ]),
    ).toBe(10000);
  });

  it('returns 0 when all KRs are at 0% progress', () => {
    expect(
      computeObjectiveProgress([
        { weightBp: 5000, progressBp: 0 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toBe(0);
  });

  it('throws WeightSumInvariantError when weights do not sum to 10000', () => {
    expect(() =>
      computeObjectiveProgress([
        { weightBp: 4000, progressBp: 5000 },
        { weightBp: 4000, progressBp: 5000 },
      ]),
    ).toThrow(WeightSumInvariantError);
  });

  it('throws RangeError when progressBp is out of range', () => {
    expect(() =>
      computeObjectiveProgress([
        { weightBp: 5000, progressBp: -1 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });
});

// ─── Derived-dates helpers (pure logic, no DB) ────────────────────────────────

/**
 * These tests document the expected behaviour of the derived-date helpers
 * used in objective.service.ts and key-result.service.ts.
 *
 * The helpers are pure computations: min(startsAt) and max(endsAt) across
 * non-deleted tasks.  They are NOT exported from okr-domain (they are
 * trivial JS Date arithmetic), but testing the expected null-fallback
 * behaviour here makes the contract explicit.
 */

function deriveKrDates(tasks: Array<{ startsAt: Date; endsAt: Date }>) {
  if (tasks.length === 0) return { startsAt: null, endsAt: null };
  const minStartMs = Math.min(...tasks.map((t) => t.startsAt.getTime()));
  const maxEndMs = Math.max(...tasks.map((t) => t.endsAt.getTime()));
  return {
    startsAt: new Date(minStartMs).toISOString(),
    endsAt: new Date(maxEndMs).toISOString(),
  };
}

function deriveObjectiveDates(
  krs: Array<{ startsAt: string | null; endsAt: string | null }>,
) {
  const withDates = krs.filter((kr) => kr.startsAt !== null && kr.endsAt !== null);
  if (withDates.length === 0) return { startsAt: null, endsAt: null };
  const minStartMs = Math.min(
    ...withDates.map((kr) => new Date(kr.startsAt as string).getTime()),
  );
  const maxEndMs = Math.max(
    ...withDates.map((kr) => new Date(kr.endsAt as string).getTime()),
  );
  return {
    startsAt: new Date(minStartMs).toISOString(),
    endsAt: new Date(maxEndMs).toISOString(),
  };
}

describe('derived KR dates', () => {
  it('returns null when KR has no tasks', () => {
    expect(deriveKrDates([])).toEqual({ startsAt: null, endsAt: null });
  });

  it('returns the task date when there is a single task', () => {
    const s = new Date('2026-04-01T00:00:00.000Z');
    const e = new Date('2026-06-30T00:00:00.000Z');
    const result = deriveKrDates([{ startsAt: s, endsAt: e }]);
    expect(result.startsAt).toBe(s.toISOString());
    expect(result.endsAt).toBe(e.toISOString());
  });

  it('spans from earliest start to latest end across multiple tasks', () => {
    const tasks = [
      { startsAt: new Date('2026-04-10T00:00:00.000Z'), endsAt: new Date('2026-05-15T00:00:00.000Z') },
      { startsAt: new Date('2026-04-01T00:00:00.000Z'), endsAt: new Date('2026-06-30T00:00:00.000Z') },
      { startsAt: new Date('2026-05-01T00:00:00.000Z'), endsAt: new Date('2026-06-01T00:00:00.000Z') },
    ];
    const result = deriveKrDates(tasks);
    expect(result.startsAt).toBe('2026-04-01T00:00:00.000Z');
    expect(result.endsAt).toBe('2026-06-30T00:00:00.000Z');
  });
});

describe('derived Objective dates', () => {
  it('returns null when no KR has tasks', () => {
    expect(
      deriveObjectiveDates([
        { startsAt: null, endsAt: null },
        { startsAt: null, endsAt: null },
      ]),
    ).toEqual({ startsAt: null, endsAt: null });
  });

  it('returns null when KR list is empty', () => {
    expect(deriveObjectiveDates([])).toEqual({ startsAt: null, endsAt: null });
  });

  it('spans from the earliest KR start to the latest KR end', () => {
    const krs = [
      { startsAt: '2026-04-01T00:00:00.000Z', endsAt: '2026-05-31T00:00:00.000Z' },
      { startsAt: '2026-03-15T00:00:00.000Z', endsAt: '2026-06-30T00:00:00.000Z' },
    ];
    const result = deriveObjectiveDates(krs);
    expect(result.startsAt).toBe('2026-03-15T00:00:00.000Z');
    expect(result.endsAt).toBe('2026-06-30T00:00:00.000Z');
  });

  it('ignores KRs with null dates when computing min/max', () => {
    const krs = [
      { startsAt: null, endsAt: null },
      { startsAt: '2026-04-01T00:00:00.000Z', endsAt: '2026-05-31T00:00:00.000Z' },
    ];
    const result = deriveObjectiveDates(krs);
    expect(result.startsAt).toBe('2026-04-01T00:00:00.000Z');
    expect(result.endsAt).toBe('2026-05-31T00:00:00.000Z');
  });
});

function countImbalancedKrs(krs: Array<{ tasks: Array<{ weightBp: number }> }>): number {
  return krs.filter((kr) => {
    const sum = kr.tasks.reduce((acc, t) => acc + t.weightBp, 0);
    return kr.tasks.length > 0 && sum !== 10000;
  }).length;
}

describe('imbalanced KR count', () => {
  it('returns 0 when all KRs have balanced task weights', () => {
    const krs: Array<{ tasks: Array<{ weightBp: number }> }> = [
      { tasks: [{ weightBp: 5000 }, { weightBp: 5000 }] },
      { tasks: [{ weightBp: 10000 }] },
    ];
    expect(countImbalancedKrs(krs)).toBe(0);
  });

  it('counts KRs with imbalanced task weights', () => {
    const krs: Array<{ tasks: Array<{ weightBp: number }> }> = [
      { tasks: [{ weightBp: 5000 }, { weightBp: 5000 }] }, // balanced
      { tasks: [{ weightBp: 3000 }, { weightBp: 3000 }] }, // imbalanced (6000)
      { tasks: [{ weightBp: 10000 }] },                    // balanced
      { tasks: [{ weightBp: 2000 }] },                     // imbalanced (2000)
    ];
    expect(countImbalancedKrs(krs)).toBe(2);
  });

  it('does not count KRs with no tasks as imbalanced', () => {
    const krs: Array<{ tasks: Array<{ weightBp: number }> }> = [
      { tasks: [] },
      { tasks: [] },
    ];
    expect(countImbalancedKrs(krs)).toBe(0);
  });
});
