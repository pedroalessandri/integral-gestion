import { IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsInt()
  @Min(1)
  @Max(10000)
  weightBp!: number;

  /** ISO-8601 date string. Must be >= parent Period.startsAt. */
  @IsISO8601({ strict: true })
  startsAt!: string;

  /** ISO-8601 date string. Must be <= parent Period.endsAt and >= startsAt. */
  @IsISO8601({ strict: true })
  endsAt!: string;
}
