import type { ProgressStatus } from './key-result.dto.js';
import type { TaskStatus } from './task.dto.js';

/**
 * Gantt projection of a single Task.
 * Dates are ISO-8601 UTC strings; tasks always have non-null dates in the DB.
 */
export interface TaskGanttDto {
  id: string;
  title: string;
  /** Derived at read time — never persisted. */
  status: TaskStatus;
  /** Integer 0..10000. Direct input per RN-06. */
  progressBp: number;
  /** ISO-8601 UTC. Scheduled start date. */
  startsAt: string;
  /** ISO-8601 UTC. Scheduled end date. */
  endsAt: string;
}

/**
 * Gantt projection of a Key Result with its nested tasks.
 * Dates are derived at read time from min/max of active task dates.
 */
export interface KeyResultGanttDto {
  id: string;
  title: string;
  /** Derived at read time — never persisted. */
  status: ProgressStatus;
  /** Integer 0..10000. Pre-computed cache from DB. */
  progressCachedBp: number;
  /**
   * Derived from min(task.startsAt) of non-deleted tasks.
   * Null when the KR has no tasks.
   */
  startsAt: string | null;
  /**
   * Derived from max(task.endsAt) of non-deleted tasks.
   * Null when the KR has no tasks.
   */
  endsAt: string | null;
  tasks: TaskGanttDto[];
}

/**
 * Gantt projection of an Objective with its nested Key Results (and their tasks).
 * Dates are derived at read time from min/max of KR dates that have tasks.
 */
export interface ObjectiveGanttDto {
  id: string;
  title: string;
  /** Derived at read time — never persisted. */
  status: ProgressStatus;
  /** Integer 0..10000. Pre-computed cache from DB. */
  progressCachedBp: number;
  /**
   * Derived from min(kr.startsAt) of KRs that have tasks.
   * Null when no KR has tasks with dates.
   */
  startsAt: string | null;
  /**
   * Derived from max(kr.endsAt) of KRs that have tasks.
   * Null when no KR has tasks with dates.
   */
  endsAt: string | null;
  keyResults: KeyResultGanttDto[];
}
