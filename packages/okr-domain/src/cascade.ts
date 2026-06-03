import type { TaskInput } from './types';

/**
 * Error thrown when the weight sum invariant is violated.
 * Callers should validate weights before calling cascade functions;
 * this error is the last line of defence (defensive programming).
 *
 * RN-04/RN-05: weights within a parent must sum to exactly 10000 bp.
 */
export class WeightSumInvariantError extends Error {
  readonly actual: number;
  readonly expected: number;

  constructor(actual: number, expected: number) {
    super(
      `WeightSumInvariantError: weights sum to ${actual} but expected ${expected}`,
    );
    this.name = 'WeightSumInvariantError';
    this.actual = actual;
    this.expected = expected;
  }
}

const BP_MAX = 10_000;

function assertValidBp(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BP_MAX) {
    throw new RangeError(
      `${label} must be an integer in [0, ${BP_MAX}], got ${value}`,
    );
  }
}

function assertWeightSum(items: Array<{ weightBp: number }>): void {
  const sum = items.reduce((acc, item) => acc + item.weightBp, 0);
  if (sum !== BP_MAX) {
    throw new WeightSumInvariantError(sum, BP_MAX);
  }
}

/**
 * Compute a Key Result's progress from its tasks.
 *
 * Formula: Math.trunc(Σ(weightBp_i × progressBp_i) / 10_000)
 * Integer arithmetic throughout; truncation at the final step only.
 *
 * RN-07: empty tasks array returns 0.
 *
 * @param tasks - Array of task contributions. Weights must sum to 10000.
 * @returns Progress in basis points [0, 10000].
 * @throws RangeError if any weightBp or progressBp is outside [0, 10000] or non-integer.
 * @throws WeightSumInvariantError if weights do not sum to 10000.
 */
export function computeKrProgress(tasks: TaskInput[]): number {
  if (tasks.length === 0) {
    return 0; // RN-07
  }

  for (const task of tasks) {
    assertValidBp(task.weightBp, 'task.weightBp');
    assertValidBp(task.progressBp, 'task.progressBp');
  }

  assertWeightSum(tasks);

  const numerator = tasks.reduce(
    (acc, task) => acc + task.weightBp * task.progressBp,
    0,
  );

  return Math.trunc(numerator / BP_MAX);
}

/**
 * Compute an Objective's progress from its Key Results' computed progress values.
 *
 * Formula: Math.trunc(Σ(weightBp_j × progressBp_j) / 10_000)
 *
 * RN-08: empty krs array returns 0.
 *
 * @param krs - Array of KR contributions with their already-computed progressBp.
 * @returns Progress in basis points [0, 10000].
 * @throws RangeError if any weightBp or progressBp is outside [0, 10000] or non-integer.
 * @throws WeightSumInvariantError if weights do not sum to 10000.
 */
export function computeObjectiveProgress(
  krs: Array<{ weightBp: number; progressBp: number }>,
): number {
  if (krs.length === 0) {
    return 0; // RN-08
  }

  for (const kr of krs) {
    assertValidBp(kr.weightBp, 'kr.weightBp');
    assertValidBp(kr.progressBp, 'kr.progressBp');
  }

  assertWeightSum(krs);

  const numerator = krs.reduce(
    (acc, kr) => acc + kr.weightBp * kr.progressBp,
    0,
  );

  return Math.trunc(numerator / BP_MAX);
}
