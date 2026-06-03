/**
 * Weight-sum invariant helpers for OKR entities.
 *
 * RN-04/RN-05: the weights of all active KRs within an Objective must sum to exactly
 * 10000 bp (100%), and the weights of all active Tasks within a KR must also sum to 10000 bp.
 *
 * RN-25: before soft-deleting a KR or Task, the projected sum (total minus the deleted item)
 * must be checked. If it would leave siblings with a sum ≠ 10000, the operation must be blocked
 * at the service layer.
 */

const BP_MAX = 10_000;

function assertValidWeightBp(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BP_MAX) {
    throw new RangeError(
      `${label} must be an integer in [0, ${BP_MAX}], got ${value}`,
    );
  }
}

/**
 * Validate that the sum of weightBp values equals the expected total.
 *
 * RN-04/RN-05: use expected=10000 (default) for active-item validation.
 * Use expected=0 to validate an empty set explicitly.
 *
 * @param items - Array of objects with a weightBp field.
 * @param expected - Expected sum (default 10000).
 * @returns `{ ok: true }` or `{ ok: false, actual, expected }`.
 * @throws RangeError if any weightBp is negative, > 10000, or non-integer.
 */
export function validateWeightSumInvariant(
  items: Array<{ weightBp: number }>,
  expected = 10_000,
): { ok: true } | { ok: false; actual: number; expected: number } {
  for (const item of items) {
    assertValidWeightBp(item.weightBp, 'weightBp');
  }
  const actual = items.reduce((acc, item) => acc + item.weightBp, 0);
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
 * @returns Sum of weightBp of remaining siblings.
 * @throws Error if toDeleteId is not found in siblings.
 * @throws RangeError if any weightBp is invalid.
 */
export function projectSumAfterDelete(
  siblings: Array<{ id: string; weightBp: number }>,
  toDeleteId: string,
): number {
  for (const sibling of siblings) {
    assertValidWeightBp(sibling.weightBp, 'sibling.weightBp');
  }

  const idx = siblings.findIndex((s) => s.id === toDeleteId);
  if (idx === -1) {
    throw new Error(
      `projectSumAfterDelete: toDeleteId '${toDeleteId}' not found in siblings`,
    );
  }

  return siblings.reduce((acc, sibling, i) => {
    if (i === idx) return acc;
    return acc + sibling.weightBp;
  }, 0);
}
