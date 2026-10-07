/** Cómo se calcula el avance de un proyecto (ADR-0009 D2). Hoy solo `from_tasks` es operable. */
export type ProjectProgressMode = 'from_tasks' | 'from_indicator';

/** Response item for `GET /api/v1/okr/objectives/:objectiveId/projects`. */
export interface ProjectSummaryDto {
  id: string;
  objectiveId: string;
  /** Unidad del proyecto: la del objetivo o una descendiente (RN-P4). */
  orgUnitId: string;
  title: string;
  /** Integer 0..10000, o `null` si el grupo de proyectos no usa pesos (RN-P6). */
  weightBp: number | null;
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt: string;
  progressMode: ProjectProgressMode;
  /** Avance del proyecto en basis points (promedio de sus tareas, RN-P8). Integer 0..10000. */
  progressCachedBp: number;
  /** Cantidad de tareas vivas. */
  taskCount: number;
  /** ISO-8601. */
  createdAt: string;
}

/** Response for `GET/POST/PATCH /api/v1/okr/projects[/:id]`. */
export interface ProjectDetailDto extends ProjectSummaryDto {
  organizationId: string;
  description: string | null;
  ownerUserId: string | null;
  /** Indicador fuente cuando `progressMode = from_indicator` (no operable todavía). */
  sourceObjectiveIndicatorId: string | null;
  /** ISO-8601. */
  updatedAt: string;
}

/** Request body for `POST /api/v1/okr/objectives/:objectiveId/projects`. */
export interface CreateProjectDto {
  title: string;
  description?: string;
  ownerUserId?: string | null;
  /** Unidad del proyecto. Por defecto, la del objetivo. Debe ser esa unidad o una descendiente (RN-P4). */
  orgUnitId?: string;
  /** Integer 0..10000. Omitir (o null) si el grupo no pondera (RN-P6, todo-o-nada). */
  weightBp?: number | null;
  /** ISO-8601. Dentro del período del objetivo (RN-P4). */
  startsAt: string;
  /** ISO-8601. Dentro del período del objetivo y >= startsAt. */
  endsAt: string;
  /** Solo `from_tasks` (default) es aceptado por ahora; `from_indicator` responde 422. */
  progressMode?: ProjectProgressMode;
}

/** Request body for `PATCH /api/v1/okr/projects/:id`. */
export interface UpdateProjectDto {
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  orgUnitId?: string;
  /** Integer 0..10000, o `null` para quitar el peso (el grupo debe quedar sin pesos). */
  weightBp?: number | null;
  startsAt?: string;
  endsAt?: string;
  progressMode?: ProjectProgressMode;
}

/**
 * Request body for `PUT /api/v1/okr/objectives/:objectiveId/projects/weights` y
 * `PUT /api/v1/okr/projects/:projectId/tasks/weights`.
 * Reemplaza de forma atómica los pesos de TODOS los hermanos vivos del grupo (RN-P6/RN-P7):
 * o todos con peso y suma 10000, o todos `null` (sin pesos).
 */
export interface SetSiblingWeightsDto {
  weights: Array<{ id: string; weightBp: number | null }>;
}

/**
 * Respuesta de DELETE /okr/projects/:id (200).
 * Borrar un proyecto borra también sus tareas vivas; acá vienen las afectadas.
 */
export interface DeleteProjectResultDto {
  deletedTaskCount: number;
  deletedTaskIds: string[];
}
