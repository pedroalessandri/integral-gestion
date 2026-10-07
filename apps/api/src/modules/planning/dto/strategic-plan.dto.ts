import { IsISO8601, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertStrategicPlanBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  vision!: string;

  @IsISO8601()
  mandateStartsAt!: string;

  @IsISO8601()
  mandateEndsAt!: string;
}
