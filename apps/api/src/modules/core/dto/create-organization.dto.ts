import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  Matches,
  MaxLength,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

class FirstPeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/, {
    message: 'slug must be lowercase alphanumeric with hyphens, 1-50 chars',
  })
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FirstPeriodDto)
  firstPeriod?: FirstPeriodDto;
}
