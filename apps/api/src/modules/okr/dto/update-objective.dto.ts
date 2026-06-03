import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateObjectiveDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /**
   * Pass a userId string to assign an owner, explicit null to unassign.
   * Omit entirely to leave ownership unchanged.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerUserId?: string | null;
}
