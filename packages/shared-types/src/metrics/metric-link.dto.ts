import type { MetricDirection } from './metric.dto.js';

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
