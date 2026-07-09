import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { MetricDirection } from '@gestion-publica/shared-types/metrics';
import { DECIMAL_STRING_MESSAGE, DECIMAL_STRING_RE } from './create-metric.dto.js';

/**
 * PUT /key-results/:id/metric-link — create or replace the link (RN-O2).
 * baseline defaults to the metric's current accumulated value; direction
 * defaults to the metric's own direction. targetValue is always required.
 */
export class UpsertMetricKrLinkDto {
  @IsString()
  metricId!: string;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `baselineValue ${DECIMAL_STRING_MESSAGE}` })
  baselineValue?: string;

  @Matches(DECIMAL_STRING_RE, { message: `targetValue ${DECIMAL_STRING_MESSAGE}` })
  targetValue!: string;

  @IsOptional()
  @IsIn(['increasing', 'decreasing'])
  direction?: MetricDirection;
}
