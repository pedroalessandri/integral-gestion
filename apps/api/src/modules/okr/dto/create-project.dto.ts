import { IsIn, IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ProjectProgressMode } from '@gestion-publica/shared-types/okr';

const PROGRESS_MODES: ProjectProgressMode[] = ['from_tasks', 'from_indicator'];

/** Body de `POST /okr/objectives/:objectiveId/projects` (RN-P4, RN-P6). */
export class CreateProjectDto {
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

  /** Por defecto, la unidad del objetivo. Debe ser esa unidad o una descendiente (RN-P4). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  orgUnitId?: string;

  /** Opcional y todo-o-nada con los demás proyectos del objetivo (RN-P6). `null`/omitido = sin peso. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp?: number | null;

  /** ISO-8601. Dentro del período del objetivo. */
  @IsISO8601({ strict: true })
  startsAt!: string;

  /** ISO-8601. Dentro del período del objetivo y >= startsAt. */
  @IsISO8601({ strict: true })
  endsAt!: string;

  /** Solo `from_tasks` (default) es operable por ahora; `from_indicator` responde 422. */
  @IsOptional()
  @IsIn(PROGRESS_MODES)
  progressMode?: ProjectProgressMode;
}
