/** Metric load frequency. Fixed at metric creation (RN-C3). */
export type MetricFrequency = 'weekly' | 'biweekly' | 'monthly';

/** Metric direction. Presentation-only in Módulo 1 (RN-M9). */
export type MetricDirection = 'increasing' | 'decreasing';

/** Period date range. Dates are interpreted in UTC. */
export interface PeriodRange {
  startsAt: Date;
  endsAt: Date;
}

/**
 * A metric entry as seen by the domain: an INCREMENT (not accumulated)
 * assigned to a bucket. `incrementValue` is a decimal string with up to
 * 4 fractional digits (Prisma.Decimal.toString() compatible).
 */
export interface EntryInput {
  bucketDate: Date;
  incrementValue: string;
}

/** One point of the accumulated (real) curve. */
export interface CumulativePoint {
  bucketDate: Date;
  cumulativeValue: string;
}
