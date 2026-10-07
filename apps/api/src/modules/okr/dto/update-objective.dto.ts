import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

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

  /** Cambia la unidad (ministry|area de la misma org). No admite null: una vez asignada no se deja sin unidad. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  orgUnitId?: string;

  /** Eje del plan activo; null lo quita; omitido lo deja igual. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  axisId?: string | null;
}
