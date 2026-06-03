/**
 * Input types for cascade arithmetic.
 * All numeric values are integers in basis-points (0..10000 = 0%..100%).
 *
 * RN-04/RN-05: weights must be integers and sum to 10000 within their parent.
 * RN-06: a Task carries its own weight relative to its sibling Tasks within a KR.
 */

/**
 * A single Task contribution to a Key Result's progress.
 * RN-06: weightBp is the task's share within the KR (integer, 0..10000).
 */
export interface TaskInput {
  /** Basis-point weight of this task within its KR. Integer in [0, 10000]. RN-04/RN-05. */
  weightBp: number;
  /** Current progress of this task. Integer in [0, 10000]. RN-06. */
  progressBp: number;
}

/**
 * A Key Result with its tasks, used to drive the cascade up to the Objective.
 * RN-05: weightBp is the KR's share within the Objective.
 */
export interface KrInput {
  /** Basis-point weight of this KR within its Objective. Integer in [0, 10000]. RN-04/RN-05. */
  weightBp: number;
  /** Tasks that make up this KR's progress. Cascade: KR progress = f(tasks). */
  tasks: TaskInput[];
}

/**
 * An Objective with its Key Results, used to recompute overall progress.
 */
export interface ObjectiveInput {
  keyResults: KrInput[];
}

/**
 * Result of a full cascade computation from tasks up to the Objective level.
 */
export interface CascadeResult {
  /** Objective-level progress in basis points. Integer in [0, 10000]. */
  objectiveProgressBp: number;
  /** Per-KR progress, in the same order as the input keyResults array. */
  keyResults: Array<{ progressBp: number }>;
}

/**
 * Structured error payload for weight-sum invariant violations.
 * RN-04/RN-05: weights within a parent must sum to exactly 10000.
 */
export interface WeightSumError {
  /** The actual sum observed. */
  actual: number;
  /** The expected sum (always 10000 for active-items invariant). */
  expected: number;
}
