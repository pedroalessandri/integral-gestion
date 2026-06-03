import { IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  weightBp?: number;

  /** ISO-8601 date string. If provided, must be >= parent Period.startsAt. */
  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  /** ISO-8601 date string. If provided, must be <= parent Period.endsAt and >= startsAt. */
  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;
}
