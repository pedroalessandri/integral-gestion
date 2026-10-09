import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** Unidad ministry|area de la misma org (RN-P3). Obligatoria. */
  @IsString()
  @IsNotEmpty()
  orgUnitId!: string;

  /** Eje del plan activo (RN-P2). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  axisId?: string;
}
