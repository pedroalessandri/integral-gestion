import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Query de GET /okr/planning-tree. Contrato en `shared-types/okr/planning-tree.dto.ts`. */
export class PlanningTreeQueryDto {
  /** Período cuyos objetivos se muestran. Sin él, el período abierto de la org (decisión de Pedro, C21). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  periodId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  axisId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orgUnitId?: string;
}
