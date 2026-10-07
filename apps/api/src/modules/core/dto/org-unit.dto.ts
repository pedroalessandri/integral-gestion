import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const NON_CENTRAL_KINDS = ['ministry', 'area'] as const;

export class CreateOrgUnitBodyDto {
  @IsString()
  @IsNotEmpty()
  parentId!: string;

  /** La raíz `central` no se crea por API (RN-P1): se crea sola al habilitar el módulo. */
  @IsIn(NON_CENTRAL_KINDS)
  kind!: 'ministry' | 'area';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  vision?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  mission?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  order?: number;
}

export class UpdateOrgUnitBodyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(NON_CENTRAL_KINDS)
  kind?: 'ministry' | 'area';

  /** Mover el subárbol bajo otro padre. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  vision?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  mission?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  order?: number;
}
