import { IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Body de `POST /okr/projects/:projectId/tasks` (RN-P5, RN-P6). */
export class CreateProjectTaskDto {
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

  /** Opcional y todo-o-nada con las demás tareas del proyecto (RN-P6). `null`/omitido = sin peso. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp?: number | null;

  /** ISO-8601. Debe ser >= project.startsAt. */
  @IsISO8601({ strict: true })
  startsAt!: string;

  /** ISO-8601. Debe ser <= project.endsAt y >= startsAt. */
  @IsISO8601({ strict: true })
  endsAt!: string;
}
