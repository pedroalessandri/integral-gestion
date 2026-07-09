import { parseDecimal4 } from './decimal';

/**
 * Linear-interpolation progress in basis points (Int 0..10000):
 *
 *   raw = (actual − baseline) / (target − baseline)
 *   progressBp = trunc(clamp(raw, 0, 1) × 10000)
 *
 * The same formula covers increasing and decreasing directions through the
 * sign of the denominator: for a decreasing metric (target < baseline),
 * getting worse yields a negative raw (→ 0) and beating the target clamps
 * to 10000. Edge case baseline === target (undefined slope): 10000 when the
 * actual reached the target, 0 otherwise.
 */
export function progressBp(input: {
  actual: string;
  baseline: string;
  target: string;
}): number {
  const actual = parseDecimal4(input.actual);
  const baseline = parseDecimal4(input.baseline);
  const target = parseDecimal4(input.target);

  const span = target - baseline;
  if (span === 0n) return actual === target ? 10_000 : 0;

  const raw = ((actual - baseline) * 10_000n) / span;
  if (raw <= 0n) return 0;
  if (raw >= 10_000n) return 10_000;
  return Number(raw);
}

/**
 * Automatic KR progress in basis points, per docs/features/indicadores-okr.md §3
 * (RN-O1/RN-O4): the KR percentage of an automatic Key Result derives solely
 * from the linked indicator, interpolating between the link's snapshot
 * `baseline` and `target` at the metric's accumulated `actual` value.
 *
 * This is the linear-interpolation formula of {@link progressBp} named for the
 * OKR domain. Direction is implicit in the sign of (target − baseline); the
 * link stores it explicitly only for UI/validation (D-O6). The caller treats a
 * `baseline === target` link as invalid (422) before reaching here — this
 * function still returns a defined value (10000 iff actual reached target).
 */
export function computeAutomaticKrProgressBp(input: {
  actual: string;
  baseline: string;
  target: string;
}): number {
  return progressBp(input);
}

/**
 * Signed deviation of the real curve vs the expected one, in basis points of
 * the baseline→target span. Positive = ahead of the expected curve (in the
 * direction of the target), negative = behind. NOT clamped. Returns 0 when
 * baseline === target (undefined span).
 */
export function deviationBp(input: {
  actual: string;
  expected: string;
  baseline: string;
  target: string;
}): number {
  const actual = parseDecimal4(input.actual);
  const expected = parseDecimal4(input.expected);
  const baseline = parseDecimal4(input.baseline);
  const target = parseDecimal4(input.target);

  const span = target - baseline;
  if (span === 0n) return 0;

  return Number(((actual - expected) * 10_000n) / span);
}
