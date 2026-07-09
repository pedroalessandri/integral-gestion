/**
 * Metrics DTOs (Módulo 1 "Indicadores de gestión").
 * Decimal values travel as STRINGS (never number) — CLAUDE.md rule 7.
 * Per docs/features/indicadores-gestion.md §2.
 */

export type MetricUnit = 'number' | 'percent' | 'currency';
export type MetricDirection = 'increasing' | 'decreasing';
export type MetricFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface MetricPeriodDto {
  id: string;
  code: string;
  status: 'open' | 'closed' | 'future';
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt: string;
}

export interface MetricSummaryDto {
  id: string;
  name: string;
  unit: MetricUnit;
  direction: MetricDirection;
  frequency: MetricFrequency;
  /** Decimal string. */
  baselineValue: string;
  /** Decimal string. */
  targetValue: string;
  /** Accumulated value to date (baseline + Σ increments). Decimal string. */
  lastValue: string;
  /** Expected linear-curve value to date. Decimal string. */
  expectedToDate: string;
  /** Integer 0..100 for the catalog mini progress bar. */
  progressPct: number;
  /** Always 0 in Módulo 1; populated by Módulo 2. */
  linkedKrCount: number;
  period: MetricPeriodDto;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface MetricDetailDto extends MetricSummaryDto {
  organizationId: string;
  periodId: string;
  /** Valid bucket start dates for this metric (ISO-8601 date part, UTC). */
  buckets: string[];
  /** ISO-8601 UTC. */
  updatedAt: string;
}

export interface MetricSeriesPointDto {
  /** ISO-8601 UTC. */
  date: string;
  /** Decimal string. */
  value: string;
}

export interface MetricActualPointDto {
  /** ISO-8601 UTC (bucket start). */
  bucketDate: string;
  /** Decimal string. */
  cumulativeValue: string;
}

export interface MetricSeriesDto {
  /** Expected linear curve sampled at every bucket boundary + period end. */
  expected: MetricSeriesPointDto[];
  /** Real accumulated curve — only buckets with entries (RN-C7). */
  actual: MetricActualPointDto[];
  summary: {
    /** Decimal string. */
    cumulative: string;
    /** Decimal string. */
    expectedToDate: string;
    /** Signed percentage of the baseline→target span. Integer basis-point-derived. */
    deviationPct: number;
  };
}

export interface MetricEntryDto {
  id: string;
  metricId: string;
  /** ISO-8601 UTC (bucket start). */
  bucketDate: string;
  /** Decimal string. May be negative (correction, RN-C6). */
  incrementValue: string;
  /** Accumulated value after this entry (chronological order). Decimal string. */
  cumulativeAfter: string;
  comment: string | null;
  createdBy: { id: string; displayName: string } | null;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}
