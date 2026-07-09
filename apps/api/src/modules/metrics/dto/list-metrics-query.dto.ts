import { IsIn, IsOptional } from 'class-validator';
import type { MetricFrequency } from '@gestion-publica/shared-types/metrics';

export class ListMetricsQueryDto {
  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly'])
  frequency?: MetricFrequency;

  /** Accepted for forward-compatibility; only meaningful once Módulo 2 adds KR links. */
  @IsOptional()
  @IsIn(['true', 'false'])
  linked?: string;
}
