/**
 * Weight-sum invariant helpers for OKR entities.
 *
 * RN-04/RN-05: the weights of a weighted sibling group (indicators of an Objective, projects of an
 * Objective, tasks of a Project) must sum to exactly 10000 bp (100%).
 *
 * RN-25: before soft-deleting a Project or Task, the projected sum (total minus the deleted item)
 * must be checked. If it would leave siblings with a sum ≠ 10000, the operation must be blocked
 * at the service layer.
 */

import type { WeightMode } from './types';

const BP_MAX = 10_000;

/**
 * Classify a sibling group by its weights (RN-P6, all-or-nothing).
 * - `weighted`: every item has a weightBp (non-null/undefined).
 * - `unweighted`: no item has a weightBp (simple mean applies).
 * - `mixed`: some do and some do not (invalid, never tolerated).
 * An empty group is `unweighted`.
 */
export function weightMode(
  items: ReadonlyArray<{ weightBp?: number | null | undefined }>,
): WeightMode {
  let withWeight = 0;
  for (const item of items) {
    if (item.weightBp !== null && item.weightBp !== undefined) withWeight++;
  }
  if (withWeight === 0) return 'unweighted';
  return withWeight === items.length ? 'weighted' : 'mixed';
}

function assertValidWeightBp(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BP_MAX) {
    throw new RangeError(
      `${label} must be an integer in [0, ${BP_MAX}], got ${value}`,
    );
  }
}

/**
 * Validate a sibling group's weights (RN-P6 / RN-P7).
 *
 * - All items without weight (and non-empty) -> ok (simple mean applies).
 * - All items with weight -> ok iff the sum equals `expected` (default 10000),
 *   otherwise the legacy `{ ok: false, actual, expected }` (no `reason`).
 * - Mixed -> `{ ok: false, reason: 'mixed', actual, expected }` where `actual` is
 *   the sum of the weights present.
 * - Empty group: legacy behaviour (sum 0 vs `expected`); use expected=0 to accept it.
 *
 * @throws RangeError if any present weightBp is negative, > 10000, or non-integer.
 */
export function validateWeightSumInvariant(
  items: ReadonlyArray<{ weightBp?: number | null | undefined }>,
  expected = 10_000,
):
  | { ok: true }
  | { ok: false; actual: number; expected: number; reason?: undefined }
  | { ok: false; reason: 'mixed'; actual: number; expected: number } {
  let actual = 0;
  for (const item of items) {
    if (item.weightBp !== null && item.weightBp !== undefined) {
      assertValidWeightBp(item.weightBp, 'weightBp');
      actual += item.weightBp;
    }
  }
  if (items.length > 0) {
    const mode = weightMode(items);
    if (mode === 'unweighted') return { ok: true };
    if (mode === 'mixed') return { ok: false, reason: 'mixed', actual, expected };
  }
  if (actual === expected) {
    return { ok: true };
  }
  return { ok: false, actual, expected };
}

/**
 * Compute the projected sum of sibling weights after removing one item by id.
 *
 * Used for RN-25: call this BEFORE persisting the soft-delete.
 * If the projected sum ≠ 10000, the deletion must be blocked.
 *
 * @param siblings - All current siblings (including the item to be deleted).
 * @param toDeleteId - The id of the item being deleted (first match is removed).
 * Unweighted groups (RN-P6): no weights to rebalance, so deleting always leaves a valid
 * group; returns 10000 if siblings remain (the "valid" sum) or 0 if the group becomes empty,
 * so callers comparing against 10000 keep working. Mixed groups are already invalid (RN-P6).
 *
 * @returns Sum of weightBp of remaining siblings (see unweighted note above).
 * @throws Error if toDeleteId is not found in siblings.
 * @throws RangeError if any weightBp is invalid.
 * @throws Error if the group is mixed (RN-P6).
 */
export function projectSumAfterDelete(
  siblings: ReadonlyArray<{ id: string; weightBp?: number | null | undefined }>,
  toDeleteId: string,
): number {
  const mode = weightMode(siblings);
  if (mode === 'mixed') {
    throw new Error('projectSumAfterDelete: mixed weight group is invalid (RN-P6)');
  }
  for (const sibling of siblings) {
    if (sibling.weightBp !== null && sibling.weightBp !== undefined) {
      assertValidWeightBp(sibling.weightBp, 'sibling.weightBp');
    }
  }

  const idx = siblings.findIndex((s) => s.id === toDeleteId);
  if (idx === -1) {
    throw new Error(
      `projectSumAfterDelete: toDeleteId '${toDeleteId}' not found in siblings`,
    );
  }

  if (mode === 'unweighted') {
    return siblings.length - 1 > 0 ? BP_MAX : 0;
  }

  return siblings.reduce((acc, sibling, i) => {
    if (i === idx) return acc;
    return acc + (sibling.weightBp ?? 0);
  }, 0);
}
