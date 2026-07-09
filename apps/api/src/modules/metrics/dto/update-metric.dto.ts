import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DECIMAL_STRING_RE, DECIMAL_STRING_MESSAGE } from './create-metric.dto.js';

/**
 * RN-M2: unit, direction and frequency are IMMUTABLE after creation — they are
 * not part of this DTO, and the controller validates the body with
 * forbidNonWhitelisted so attempts to change them are rejected.
 */
export class UpdateMetricDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `baselineValue ${DECIMAL_STRING_MESSAGE}` })
  baselineValue?: string;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `targetValue ${DECIMAL_STRING_MESSAGE}` })
  targetValue?: string;
}
