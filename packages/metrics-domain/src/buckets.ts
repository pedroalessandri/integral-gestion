import type { MetricFrequency, PeriodRange } from './types';

/**
 * Bucket derivation per RN-C4 (docs/features/indicadores-modelo-comun.md):
 *  - weekly   → Monday of every week intersecting the period
 *  - biweekly → days 1 and 16 of every month
 *  - monthly  → day 1 of every month
 * The FIRST bucket always starts at the period start, even when it does not
 * fall on a natural boundary. All dates are UTC midnights.
 */

/** Returns the UTC midnight of the given date. */
export function toUTCMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextBoundary(after: Date, frequency: MetricFrequency): Date {
  const d = new Date(after);
  if (frequency === 'weekly') {
    // Next Monday strictly after `after` (0=Sun, 1=Mon).
    const dow = d.getUTCDay();
    const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMonday);
    return d;
  }
  if (frequency === 'biweekly') {
    const day = d.getUTCDate();
    if (day < 16) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 16));
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  // monthly
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * Returns the bucket start dates for the period: the period start, followed by
 * every natural boundary of the frequency strictly after it and ≤ period end.
 */
export function buildBuckets(range: PeriodRange, frequency: MetricFrequency): Date[] {
  const start = toUTCMidnight(range.startsAt);
  const end = toUTCMidnight(range.endsAt);
  const buckets: Date[] = [start];

  let cursor = nextBoundary(start, frequency);
  while (cursor.getTime() <= end.getTime()) {
    buckets.push(cursor);
    cursor = nextBoundary(cursor, frequency);
  }
  return buckets;
}

/** True when `date` (UTC midnight) is a valid bucket start for the period (RN-M5). */
export function isValidBucketDate(
  date: Date,
  range: PeriodRange,
  frequency: MetricFrequency,
): boolean {
  const target = toUTCMidnight(date).getTime();
  return buildBuckets(range, frequency).some((b) => b.getTime() === target);
}
