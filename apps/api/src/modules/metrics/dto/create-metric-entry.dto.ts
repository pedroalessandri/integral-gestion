import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DECIMAL_STRING_RE, DECIMAL_STRING_MESSAGE } from './create-metric.dto.js';

export class CreateMetricEntryDto {
  /** ISO-8601 date of the bucket start. Must be a valid bucket boundary (RN-M5). */
  @IsISO8601()
  bucketDate!: string;

  /** Increment (not accumulated). May be negative as a correction (RN-C6). */
  @Matches(DECIMAL_STRING_RE, { message: `incrementValue ${DECIMAL_STRING_MESSAGE}` })
  incrementValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
