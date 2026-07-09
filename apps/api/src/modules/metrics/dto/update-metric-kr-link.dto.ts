import { IsIn, IsOptional, Matches } from 'class-validator';
import type { MetricDirection } from '@gestion-publica/shared-types/metrics';
import { DECIMAL_STRING_MESSAGE, DECIMAL_STRING_RE } from './create-metric.dto.js';

/**
 * PATCH /key-results/:id/metric-link — edit snapshot baseline/target/direction
 * mid-period (RN-O9). All fields optional; the service rejects an empty patch.
 */
export class UpdateMetricKrLinkDto {
  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `baselineValue ${DECIMAL_STRING_MESSAGE}` })
  baselineValue?: string;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `targetValue ${DECIMAL_STRING_MESSAGE}` })
  targetValue?: string;

  @IsOptional()
  @IsIn(['increasing', 'decreasing'])
  direction?: MetricDirection;
}
