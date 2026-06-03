import { IsString, IsOptional, MaxLength } from 'class-validator';

export class DeactivateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
