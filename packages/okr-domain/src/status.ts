/**
 * Pure helpers for computing derived status fields from OKR data.
 * No DB access — all inputs are plain values.
 */

/** Derived status for a Task (considers scheduling + progress). */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue';

/** Derived status for a KR or Objective (pure progress-based). */
export type ProgressStatus = 'pending' | 'in_progress' | 'done';

/**
 * Compute the derived status of a Task.
 *
 * Rules:
 * - progressBp === 10000 → 'done'
 * - progressBp < 10000 AND now > endsAt → 'overdue'
 * - progressBp > 0 AND progressBp < 10000 → 'in_progress'
 * - progressBp === 0 → 'pending'
 *
 * @param progressBp  Current task progress, integer 0..10000.
 * @param endsAt      Scheduled end date of the task.
 * @param now         Current timestamp (injectable for testability).
 */
export function computeTaskStatus(
  progressBp: number,
  endsAt: Date,
  now: Date = new Date(),
): TaskStatus {
  if (progressBp >= 10000) return 'done';
  if (now > endsAt) return 'overdue';
  if (progressBp > 0) return 'in_progress';
  return 'pending';
}

/**
 * Compute the derived status of a KR or Objective from its cached progress.
 *
 * Rules:
 * - progressBp === 10000 → 'done'
 * - progressBp > 0       → 'in_progress'
 * - progressBp === 0     → 'pending'
 *
 * @param progressBp  Cached progress in basis points, integer 0..10000.
 */
export function computeProgressStatus(progressBp: number): ProgressStatus {
  if (progressBp >= 10000) return 'done';
  if (progressBp > 0) return 'in_progress';
  return 'pending';
}
