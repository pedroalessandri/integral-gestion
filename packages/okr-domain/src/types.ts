/**
 * Input types for cascade arithmetic.
 * All numeric values are integers in basis-points (0..10000 = 0%..100%).
 *
 * RN-04/RN-05: weights must be integers and sum to 10000 within their parent.
 */

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

/**
 * Item of a sibling group whose weight is optional (RN-P6: all-or-nothing).
 * `null`/`undefined` means "no weight": the group is averaged with a simple mean.
 */
export interface OptionalWeightInput {
  /** Basis-point weight within the sibling group. Integer in [0, 10000], or null/undefined. RN-P6. */
  weightBp?: number | null | undefined;
  /** Current progress. Integer in [0, 10000]. */
  progressBp: number;
}

/** A Task of a Project (RN-P8). Weight is all-or-nothing within the project (RN-P6). */
export type ProjectTaskInput = OptionalWeightInput;

/** A Project of an Objective (RN-P8: execution progress). Weight is all-or-nothing within the objective (RN-P6). */
export type ProjectInput = OptionalWeightInput;

/** An ObjectiveIndicator of an Objective (RN-P8: result progress). Weight is all-or-nothing within the objective (RN-P6). */
export type IndicatorInput = OptionalWeightInput;

/** Weight classification of a sibling group (RN-P6). */
export type WeightMode = 'weighted' | 'unweighted' | 'mixed';

/** A task with a schedule, used for planned progress by dates (RN-P9). */
export interface ScheduledTaskInput {
  startsAt: Date;
  endsAt: Date;
  weightBp?: number | null | undefined;
}
