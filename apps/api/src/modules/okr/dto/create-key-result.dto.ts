import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateKeyResultDto {
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
}
