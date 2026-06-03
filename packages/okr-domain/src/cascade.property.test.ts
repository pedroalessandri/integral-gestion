import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { computeKrProgress, computeObjectiveProgress } from './cascade';
import type { TaskInput } from './types';

/**
 * Generates an array of N integers that sum to exactly `total`,
 * each in [1, total - (n-1)] (so each part is at least 1).
 */
function exactSumParts(total: number, n: number): fc.Arbitrary<number[]> {
  if (n === 1) {
    return fc.constant([total]);
  }
  // Generate n-1 "cut points" in [1, total-1] sorted, then derive n gaps
  return fc
    .uniqueArray(fc.integer({ min: 1, max: total - 1 }), {
      minLength: n - 1,
      maxLength: n - 1,
    })
    .map((cuts) => {
      const sorted = [...cuts].sort((a, b) => a - b);
      const parts: number[] = [];
      let prev = 0;
      for (const cut of sorted) {
        parts.push(cut - prev);
        prev = cut;
      }
      parts.push(total - prev);
      return parts;
    });
}

/**
 * Arbitrary for a valid tasks array: N tasks (1..8), weights summing to 10000.
 */
const validTasksArb = fc
  .integer({ min: 1, max: 8 })
  .chain((n) =>
    exactSumParts(10_000, n).chain((weights) =>
      fc
        .array(fc.integer({ min: 0, max: 10_000 }), {
          minLength: n,
          maxLength: n,
        })
        .map((progresses) =>
          weights.map(
            (w, i): TaskInput => ({
              weightBp: w,
              // biome-ignore: progressBp guaranteed by generator
              progressBp: progresses[i] ?? 0,
            }),
          ),
        ),
    ),
  );

/**
 * Arbitrary for a valid KR-level input: N krs with weights summing to 10000.
 */
const validKrsArb = fc
  .integer({ min: 1, max: 8 })
  .chain((n) =>
    exactSumParts(10_000, n).chain((weights) =>
      fc
        .array(fc.integer({ min: 0, max: 10_000 }), {
          minLength: n,
          maxLength: n,
        })
        .map((progresses) =>
          weights.map((w, i) => ({
            weightBp: w,
            progressBp: progresses[i] ?? 0,
          })),
        ),
    ),
  );

describe('computeKrProgress property tests', () => {
  it('all tasks at 100% → KR at 100% (10000 bp)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          exactSumParts(10_000, n).map((weights) =>
            weights.map((w): TaskInput => ({ weightBp: w, progressBp: 10_000 })),
          ),
        ),
        (tasks) => {
          return computeKrProgress(tasks) === 10_000;
        },
      ),
    );
  });

  it('all tasks at 0% → KR at 0% (0 bp)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          exactSumParts(10_000, n).map((weights) =>
            weights.map((w): TaskInput => ({ weightBp: w, progressBp: 0 })),
          ),
        ),
        (tasks) => {
          return computeKrProgress(tasks) === 0;
        },
      ),
    );
  });

  it('result is always in [0, 10000] for any valid input', () => {
    fc.assert(
      fc.property(validTasksArb, (tasks) => {
        const result = computeKrProgress(tasks);
        return result >= 0 && result <= 10_000;
      }),
    );
  });

  it('bounded linearity: uniform progress p → result within 1 bp of p (weighted avg of identical values = value)', () => {
    // When all progressBp = x, the result = Math.trunc(x * sum(weights) / 10000) = Math.trunc(x * 1) = x
    // (since sum(weights) === 10000). No truncation error possible.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          exactSumParts(10_000, n).chain((weights) =>
            fc.integer({ min: 0, max: 10_000 }).map((progress) => ({
              tasks: weights.map((w): TaskInput => ({
                weightBp: w,
                progressBp: progress,
              })),
              progress,
            })),
          ),
        ),
        ({ tasks, progress }) => {
          const result = computeKrProgress(tasks);
          // When all progress values are identical, the weighted average = that value exactly.
          return result === progress;
        },
      ),
    );
  });
});

describe('computeObjectiveProgress property tests', () => {
  it('all KRs at 100% → Objective at 100%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          exactSumParts(10_000, n).map((weights) =>
            weights.map((w) => ({ weightBp: w, progressBp: 10_000 })),
          ),
        ),
        (krs) => {
          return computeObjectiveProgress(krs) === 10_000;
        },
      ),
    );
  });

  it('all KRs at 0% → Objective at 0%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          exactSumParts(10_000, n).map((weights) =>
            weights.map((w) => ({ weightBp: w, progressBp: 0 })),
          ),
        ),
        (krs) => {
          return computeObjectiveProgress(krs) === 0;
        },
      ),
    );
  });

  it('result is always in [0, 10000] for any valid input', () => {
    fc.assert(
      fc.property(validKrsArb, (krs) => {
        const result = computeObjectiveProgress(krs);
        return result >= 0 && result <= 10_000;
      }),
    );
  });
});
