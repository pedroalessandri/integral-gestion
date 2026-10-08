import type { IndicatorInput, OptionalWeightInput, ProjectInput, ProjectTaskInput, TaskInput } from './types';
import { weightMode } from './invariants';

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

/**
 * Error thrown when a sibling group mixes weighted and unweighted items.
 * RN-P6: weights are all-or-nothing per sibling group.
 */
export class MixedWeightGroupError extends Error {
  constructor() {
    super(
      'MixedWeightGroupError: sibling group mixes items with and without weightBp (RN-P6)',
    );
    this.name = 'MixedWeightGroupError';
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

/**
 * Central aggregation of sibling progress (RN-P6, RN-P8; ADR-0009 D3).
 * The single place where the rounding rule lives: `Math.trunc` over basis points.
 *
 * - Empty -> 0.
 * - Weighted (all have weightBp): `Math.trunc(Σ w·p / 10000)`; weights must sum to 10000.
 * - Unweighted (none has weightBp): `Math.trunc(Σ p / n)`.
 * - Mixed -> MixedWeightGroupError.
 *
 * @param label - Prefix for RangeError messages (e.g. 'task').
 * @throws RangeError if any weightBp or progressBp is outside [0, 10000] or non-integer.
 * @throws WeightSumInvariantError if weighted and the sum is not 10000.
 * @throws MixedWeightGroupError if the group is mixed.
 */
export function aggregateProgressBp(
  items: ReadonlyArray<OptionalWeightInput>,
  label = 'item',
): number {
  if (items.length === 0) {
    return 0;
  }

  const mode = weightMode(items);
  if (mode === 'mixed') {
    throw new MixedWeightGroupError();
  }

  for (const item of items) {
    if (item.weightBp !== null && item.weightBp !== undefined) {
      assertValidBp(item.weightBp, `${label}.weightBp`);
    }
    assertValidBp(item.progressBp, `${label}.progressBp`);
  }

  if (mode === 'unweighted') {
    const total = items.reduce((acc, item) => acc + item.progressBp, 0);
    return Math.trunc(total / items.length);
  }

  const sum = items.reduce((acc, item) => acc + (item.weightBp ?? 0), 0);
  if (sum !== BP_MAX) {
    throw new WeightSumInvariantError(sum, BP_MAX);
  }
  const numerator = items.reduce(
    (acc, item) => acc + (item.weightBp ?? 0) * item.progressBp,
    0,
  );
  return Math.trunc(numerator / BP_MAX);
}

/**
 * Compute a Key Result's progress from its tasks (legacy KR path).
 *
 * RN-07: empty tasks array returns 0.
 *
 * @throws RangeError if any weightBp or progressBp is outside [0, 10000] or non-integer.
 * @throws WeightSumInvariantError if weights do not sum to 10000.
 */
export function computeKrProgress(tasks: TaskInput[]): number {
  return aggregateProgressBp(tasks, 'task');
}

/**
 * Compute an Objective's progress from its Key Results' computed progress values (legacy KR path).
 *
 * RN-08: empty krs array returns 0.
 *
 * @throws RangeError if any weightBp or progressBp is outside [0, 10000] or non-integer.
 * @throws WeightSumInvariantError if weights do not sum to 10000.
 */
export function computeObjectiveProgress(
  krs: Array<{ weightBp: number; progressBp: number }>,
): number {
  return aggregateProgressBp(krs, 'kr');
}

/**
 * RN-P8: a Project's progress = (weighted or simple) mean of its tasks. RN-P6 applies.
 */
export function computeProjectProgress(tasks: ReadonlyArray<ProjectTaskInput>): number {
  return aggregateProgressBp(tasks, 'task');
}

/**
 * RN-P8: an Objective's execution (gestion) progress = (weighted or simple) mean of its
 * projects. RN-P6 applies. Never combined with result progress.
 */
export function computeExecutionProgress(projects: ReadonlyArray<ProjectInput>): number {
  return aggregateProgressBp(projects, 'project');
}

/**
 * RN-P8: an Objective's result progress = (weighted or simple) mean of its indicators' progress.
 * RN-P6 applies (all-or-nothing weights). Never combined with execution progress.
 */
export function computeResultProgress(indicators: ReadonlyArray<IndicatorInput>): number {
  return aggregateProgressBp(indicators, 'indicator');
}
