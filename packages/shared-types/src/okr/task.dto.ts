/** Derived status for a Task — computed at read time, never persisted. */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue';

export interface TaskSummaryDto {
  id: string;
  /** Proyecto (N5). */
  projectId: string;
  title: string;
  /**
   * Integer 0..10000. `null` si el grupo de hermanos no usa pesos (RN-P6):
   * en ese caso se promedia simple.
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
  /** Integer 0..10000. `null` quita el peso (el grupo debe quedar sin pesos). */
  weightBp?: number | null;
  /** ISO-8601. */
  startsAt?: string;
  /** ISO-8601. */
  endsAt?: string;
}
