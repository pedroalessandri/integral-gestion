import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateKeyResultDto {
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
}
