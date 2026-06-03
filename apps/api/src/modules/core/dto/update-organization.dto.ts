import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  mission?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  vision?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  values?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  context?: string | null;
}
