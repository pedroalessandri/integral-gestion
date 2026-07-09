import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  MetricDirection,
  MetricFrequency,
  MetricUnit,
} from '@gestion-publica/shared-types/metrics';

/** Decimal string, up to 14 integer + 4 fractional digits (DECIMAL(18,4)). */
export const DECIMAL_STRING_RE = /^-?\d{1,14}(\.\d{1,4})?$/;
export const DECIMAL_STRING_MESSAGE =
  'must be a decimal string with up to 4 fractional digits (e.g. "500", "12.5")';

export class CreateMetricDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsIn(['number', 'percent', 'currency'])
  unit!: MetricUnit;

  @IsIn(['increasing', 'decreasing'])
  direction!: MetricDirection;

  @IsIn(['weekly', 'biweekly', 'monthly'])
  frequency!: MetricFrequency;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `baselineValue ${DECIMAL_STRING_MESSAGE}` })
  baselineValue?: string;

  @Matches(DECIMAL_STRING_RE, { message: `targetValue ${DECIMAL_STRING_MESSAGE}` })
  targetValue!: string;
}
