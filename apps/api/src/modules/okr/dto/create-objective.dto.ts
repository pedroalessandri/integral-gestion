import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateObjectiveDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}
