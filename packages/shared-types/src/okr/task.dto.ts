/** Derived status for a Task — computed at read time, never persisted. */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue';

export interface TaskSummaryDto {
  id: string;
  keyResultId: string;
  title: string;
  /** Integer 0..10000. */
  weightBp: number;
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

/** Request body for PATCH /api/v1/okr/tasks/:id. */
export interface UpdateTaskDto {
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  /** Integer 0..10000. */
  weightBp?: number;
  /** ISO-8601. */
  startsAt?: string;
  /** ISO-8601. */
  endsAt?: string;
}
