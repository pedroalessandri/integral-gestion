/**
 * Pure helpers for computing derived status fields from OKR data.
 * No DB access — all inputs are plain values.
 */

/** Derived status for a Task (considers scheduling + progress). */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue';

/** Derived status for an Objective (pure progress-based). */
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
 * Compute the derived status of an Objective from its cached progress.
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

/** Derived status for a Project: same rule as `computeTaskStatus` applied to the project's progress and end date. */
export type ProjectStatus = TaskStatus;

/**
 * Compute the derived status of a Project (ADR-0010). Mismas reglas que `computeTaskStatus`.
 *
 * @param progressBp  Project cached progress, integer 0..10000.
 * @param endsAt      Planned end date of the project.
 * @param now         Current timestamp (injectable for testability).
 */
export function computeProjectStatus(
  progressBp: number,
  endsAt: Date,
  now: Date = new Date(),
): ProjectStatus {
  return computeTaskStatus(progressBp, endsAt, now);
}

export type ProjectDelayReason = 'vencido' | 'tareas_vencidas';

export interface ProjectDelayInput {
  progressBp: number;
  endsAt: Date;
  progressMode: 'from_tasks' | 'from_indicator';
  tasks: ReadonlyArray<{ progressBp: number; endsAt: Date }>;
}

/**
 * Is the project delayed? (ADR-0010 `listar_proyectos_atrasados`).
 *
 * - `vencido`: the project itself is `overdue` (not done and past its end date).
 * - `tareas_vencidas`: some task is `overdue`, ONLY when `progressMode = 'from_tasks'` (in `from_indicator`
 *   the tasks are informative and do not mark the project as delayed).
 */
export function isProjectDelayed(
  project: ProjectDelayInput,
  now: Date = new Date(),
): { atrasado: boolean; motivos: ProjectDelayReason[] } {
  const motivos: ProjectDelayReason[] = [];
  if (computeProjectStatus(project.progressBp, project.endsAt, now) === 'overdue') motivos.push('vencido');
  if (
    project.progressMode === 'from_tasks' &&
    project.tasks.some((t) => computeTaskStatus(t.progressBp, t.endsAt, now) === 'overdue')
  ) {
    motivos.push('tareas_vencidas');
  }
  return { atrasado: motivos.length > 0, motivos };
}
