import { IsIn, IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ProjectProgressMode } from '@gestion-publica/shared-types/okr';

const PROGRESS_MODES: ProjectProgressMode[] = ['from_tasks', 'from_indicator'];

/** Body de `PATCH /okr/projects/:id`. */
export class UpdateProjectDto {
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
  @IsString()
  @IsNotEmpty()
  orgUnitId?: string;

  /** Integer 0..10000, o `null` para quitar el peso (el grupo debe quedar sin pesos, RN-P6). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp?: number | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;

  /** Solo `from_tasks` es operable por ahora; `from_indicator` responde 422. */
  @IsOptional()
  @IsIn(PROGRESS_MODES)
  progressMode?: ProjectProgressMode;
}
