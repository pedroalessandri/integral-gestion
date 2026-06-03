import { IsString, IsNotEmpty, IsISO8601, MaxLength } from 'class-validator';

export class CreatePeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}
