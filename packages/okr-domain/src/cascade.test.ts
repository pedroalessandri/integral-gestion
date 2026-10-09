import { describe, it, expect } from 'vitest';
import { computeProjectProgress, computeExecutionProgress, WeightSumInvariantError } from './cascade';

describe('computeProjectProgress', () => {
  it('returns 0 for empty tasks array (RN-07)', () => {
    expect(computeProjectProgress([])).toBe(0);
  });

  it('Worked Example 1: project at 82.00% (8200 bp) from 3 tasks', () => {
    // 3000 * 10000 + 5000 * 7000 + 2000 * 8500 = 30_000_000 + 35_000_000 + 17_000_000 = 82_000_000
    // 82_000_000 / 10_000 = 8200
    expect(
      computeProjectProgress([
        { weightBp: 3000, progressBp: 10000 },
        { weightBp: 5000, progressBp: 7000 },
        { weightBp: 2000, progressBp: 8500 },
      ]),
    ).toBe(8200);
  });

  it('returns 10000 when all tasks are at 100% progress', () => {
    expect(
      computeProjectProgress([
        { weightBp: 5000, progressBp: 10000 },
        { weightBp: 5000, progressBp: 10000 },
      ]),
    ).toBe(10000);
  });

  it('returns 0 when all tasks are at 0% progress', () => {
    expect(
      computeProjectProgress([
        { weightBp: 3000, progressBp: 0 },
        { weightBp: 7000, progressBp: 0 },
      ]),
    ).toBe(0);
  });

  it('throws WeightSumInvariantError when weights do not sum to 10000', () => {
    expect(() =>
      computeProjectProgress([
        { weightBp: 3000, progressBp: 5000 },
        { weightBp: 3000, progressBp: 5000 },
      ]),
    ).toThrow(WeightSumInvariantError);
  });

  it('throws RangeError when progressBp is out of range', () => {
    expect(() =>
      computeProjectProgress([
        { weightBp: 5000, progressBp: 10001 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it('throws RangeError when weightBp is out of range', () => {
    expect(() =>
      computeProjectProgress([
        { weightBp: 20000, progressBp: 5000 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it('throws RangeError when weightBp is negative', () => {
    expect(() =>
      computeProjectProgress([
        { weightBp: -1, progressBp: 5000 },
        { weightBp: 10001, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });
});

describe('computeExecutionProgress', () => {
  it('returns 0 for empty krs array (RN-08)', () => {
    expect(computeExecutionProgress([])).toBe(0);
  });

  it('Worked Example 2: Objective at 31.50% (3150 bp) from 2 KRs', () => {
    // 5000 * 2000 + 5000 * 4300 = 10_000_000 + 21_500_000 = 31_500_000
    // 31_500_000 / 10_000 = 3150
    expect(
      computeExecutionProgress([
        { weightBp: 5000, progressBp: 2000 },
        { weightBp: 5000, progressBp: 4300 },
      ]),
    ).toBe(3150);
  });

  it('returns 10000 when all KRs are at 100% progress', () => {
    expect(
      computeExecutionProgress([
        { weightBp: 4000, progressBp: 10000 },
        { weightBp: 6000, progressBp: 10000 },
      ]),
    ).toBe(10000);
  });

  it('returns 0 when all KRs are at 0% progress', () => {
    expect(
      computeExecutionProgress([
        { weightBp: 5000, progressBp: 0 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toBe(0);
  });

  it('throws WeightSumInvariantError when weights do not sum to 10000', () => {
    expect(() =>
      computeExecutionProgress([
        { weightBp: 4000, progressBp: 5000 },
        { weightBp: 4000, progressBp: 5000 },
      ]),
    ).toThrow(WeightSumInvariantError);
  });

  it('throws RangeError when progressBp is out of range', () => {
    expect(() =>
      computeExecutionProgress([
        { weightBp: 5000, progressBp: -1 },
        { weightBp: 5000, progressBp: 0 },
      ]),
    ).toThrow(RangeError);
  });
});
