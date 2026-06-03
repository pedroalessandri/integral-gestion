/** Derived status for a KR or Objective — computed at read time, never persisted. */
export type ProgressStatus = 'pending' | 'in_progress' | 'done';

export interface KeyResultSummaryDto {
  id: string;
  objectiveId: string;
  title: string;
  /** Integer 0..10000. */
  weightBp: number;
  /** Integer 0..10000. */
  progressCachedBp: number;
  /** Derived at read time — never persisted. */
  status: ProgressStatus;
  /** ISO-8601. */
  createdAt: string;
  /**
   * Derived at read time from min(task.startsAt) of non-deleted tasks.
   * Null when the KR has no tasks.
   */
  startsAt: string | null;
  /**
   * Derived at read time from max(task.endsAt) of non-deleted tasks.
   * Null when the KR has no tasks.
   */
  endsAt: string | null;
}

export interface KeyResultDetailDto extends KeyResultSummaryDto {
  description: string | null;
  ownerUserId: string | null;
  /** ISO-8601. */
  updatedAt: string;
}

/** Request body for POST /api/v1/okr/objectives/:objectiveId/key-results. */
export interface CreateKeyResultDto {
  title: string;
  description?: string;
  /** User ID of the responsible owner. */
  ownerUserId?: string | null;
  /** Integer 0..10000. RN-04/RN-05: sum of active KR weights must equal 10000. */
  weightBp: number;
}

/** Request body for PATCH /api/v1/okr/key-results/:id. */
export interface UpdateKeyResultDto {
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  /** Integer 0..10000. */
  weightBp?: number;
}
