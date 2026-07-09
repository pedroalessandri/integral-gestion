import { parseDecimal4, formatDecimal4 } from './decimal';
import type { PeriodRange } from './types';

/**
 * Expected curve per RN-C8: ALWAYS linear from baseline to target between the
 * period start and end. It is a visual reference — not configurable, not
 * persisted. Interpolation is exact (scaled-bigint), truncated at 4 decimals.
 */
export function expectedAt(
  at: Date,
  range: PeriodRange,
  baselineValue: string,
  targetValue: string,
): string {
  const startMs = range.startsAt.getTime();
  const endMs = range.endsAt.getTime();
  const baseline = parseDecimal4(baselineValue);
  const target = parseDecimal4(targetValue);

  const totalMs = endMs - startMs;
  if (totalMs <= 0) return formatDecimal4(target);

  const clampedMs = Math.min(Math.max(at.getTime(), startMs), endMs);
  const elapsedMs = clampedMs - startMs;

  const value = baseline + ((target - baseline) * BigInt(elapsedMs)) / BigInt(totalMs);
  return formatDecimal4(value);
}
