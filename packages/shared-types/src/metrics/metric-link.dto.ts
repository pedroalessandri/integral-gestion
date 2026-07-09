import type { MetricDirection } from './metric.dto.js';

/**
 * Metric↔KeyResult link — Módulo 2 "Indicadores en OKRs".
 * docs/features/indicadores-okr.md §5. Decimals travel as strings.
 */
export interface MetricKrLinkDto {
  id: string;
  metricId: string;
  metricName: string;
  keyResultId: string;
  /** Snapshot baseline (D-O4), decimal string. */
  baselineValue: string;
  /** Snapshot target (D-O4), decimal string. */
  targetValue: string;
  /** Snapshot direction (D-O6). */
  direction: MetricDirection;
  /** Metric's current accumulated value (baseline + Σ increments), decimal string. */
  lastValue: string;
  /** Interpolated KR progress in basis points (0..10000). 0 when 'sin-datos'. */
  computedProgressBp: number;
  /** 'sin-datos' when the metric has no entries yet (RN-O6). */
  estado: 'ok' | 'sin-datos';
  createdAt: string;
  updatedAt: string;
}

/**
 * PUT /key-results/:id/metric-link — create or replace the link (RN-O2).
 * baseline defaults to the metric's current accumulated value when omitted;
 * direction defaults to the metric's own direction when omitted.
 */
export interface UpsertMetricKrLinkDto {
  metricId: string;
  baselineValue?: string;
  targetValue: string;
  direction?: MetricDirection;
}

/**
 * PATCH /key-results/:id/metric-link — edit snapshot baseline/target/direction
 * mid-period (RN-O9). All fields optional; at least one must be present.
 */
export interface UpdateMetricKrLinkDto {
  baselineValue?: string;
  targetValue?: string;
  direction?: MetricDirection;
}

/**
 * GET /objectives/:id/context-metrics — visual-only metric context (RN-O10).
 */
export interface MetricContextDto {
  metricId: string;
  metricName: string;
  objectiveId: string;
  direction: MetricDirection;
  /** Metric's current accumulated value, decimal string. */
  lastValue: string;
  createdAt: string;
}
