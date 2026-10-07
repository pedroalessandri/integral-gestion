/** Derived status for a Task — computed at read time, never persisted. */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue';

export interface TaskSummaryDto {
  id: string;
  /** Camino KR legacy. `null` si la tarea cuelga de un proyecto (exactamente uno entre keyResultId y projectId). */
  keyResultId: string | null;
  /** Proyecto (N5). `null` si la tarea cuelga de un KR legacy. */
  projectId: string | null;
  title: string;
  /**
   * Integer 0..10000. `null` si el grupo de hermanos no usa pesos (RN-P6, solo tareas de proyecto):
   * en ese caso se promedia simple. Las tareas de KR siempre tienen peso.
   */
  weightBp: number | null;
  /** Integer 0..10000. Direct input per RN-06. */
  progressBp: number;
  /** ISO-8601 UTC. Scheduled start date. */
  startsAt: string;
  /** ISO-8601 UTC. Scheduled end date. */
  endsAt: string;
  /** Derived at read time — never persisted. */
  status: TaskStatus;
  /** ISO-8601. */
  createdAt: string;
}

export interface TaskDetailDto extends TaskSummaryDto {
  description: string | null;
  ownerUserId: string | null;
  /** ISO-8601. */
  updatedAt: string;
}

/** Request body for POST /api/v1/okr/key-results/:krId/tasks. */
export interface CreateTaskDto {
  title: string;
  description?: string;
  /** User ID of the responsible owner. */
  ownerUserId?: string | null;
  /** Integer 0..10000. */
  weightBp: number;
  /** ISO-8601. Must be >= parent Period.startsAt. */
  startsAt: string;
  /** ISO-8601. Must be <= parent Period.endsAt and >= startsAt. */
  endsAt: string;
}

/**
 * Request body for POST /api/v1/okr/projects/:projectId/tasks (RN-P5, RN-P6).
 * Fechas dentro de las del proyecto; peso opcional y todo-o-nada entre las tareas del proyecto.
 */
export interface CreateProjectTaskDto {
  title: string;
  description?: string;
  ownerUserId?: string | null;
  /** Integer 0..10000. Omitir (o null) si el proyecto no pondera sus tareas. */
  weightBp?: number | null;
  /** ISO-8601. Must be >= project.startsAt. */
  startsAt: string;
  /** ISO-8601. Must be <= project.endsAt and >= startsAt. */
  endsAt: string;
}

/** Request body for PATCH /api/v1/okr/tasks/:id. */
export interface UpdateTaskDto {
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  /** Integer 0..10000. `null` quita el peso (solo tareas de proyecto; el grupo debe quedar sin pesos). */
  weightBp?: number | null;
  /** ISO-8601. */
  startsAt?: string;
  /** ISO-8601. */
  endsAt?: string;
}
