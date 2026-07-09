import { parseDecimal4, formatDecimal4 } from './decimal';
import type { EntryInput, CumulativePoint } from './types';

/**
 * Accumulation per RN-C5: entries store INCREMENTS; the accumulated value at
 * a date is baseline + Σ increments of buckets ≤ that date. Empty buckets are
 * tolerated (RN-C7): the real curve simply has no point there.
 */

/** Groups entries by bucket and returns the accumulated (real) curve, ascending. */
export function cumulativeSeries(entries: EntryInput[], baselineValue: string): CumulativePoint[] {
  const byBucket = new Map<number, bigint>();
  for (const entry of entries) {
    const key = entry.bucketDate.getTime();
    byBucket.set(key, (byBucket.get(key) ?? 0n) + parseDecimal4(entry.incrementValue));
  }

  const sortedKeys = [...byBucket.keys()].sort((a, b) => a - b);
  let running = parseDecimal4(baselineValue);
  return sortedKeys.map((key) => {
    running += byBucket.get(key) ?? 0n;
    return { bucketDate: new Date(key), cumulativeValue: formatDecimal4(running) };
  });
}

/** Accumulated value at `at`: baseline + Σ increments with bucketDate ≤ at. */
export function cumulativeToDate(entries: EntryInput[], baselineValue: string, at: Date): string {
  let total = parseDecimal4(baselineValue);
  const cutoff = at.getTime();
  for (const entry of entries) {
    if (entry.bucketDate.getTime() <= cutoff) {
      total += parseDecimal4(entry.incrementValue);
    }
  }
  return formatDecimal4(total);
}
