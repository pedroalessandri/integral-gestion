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
