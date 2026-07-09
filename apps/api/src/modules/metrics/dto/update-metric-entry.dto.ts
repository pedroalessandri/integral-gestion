import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DECIMAL_STRING_RE, DECIMAL_STRING_MESSAGE } from './create-metric.dto.js';

/** bucketDate is immutable: to move an entry, delete it and create a new one. */
export class UpdateMetricEntryDto {
  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `incrementValue ${DECIMAL_STRING_MESSAGE}` })
  incrementValue?: string;

  /** Empty string clears the comment. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
