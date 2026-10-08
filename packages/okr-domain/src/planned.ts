import { aggregateProgressBp } from './cascade';
import type { ScheduledTaskInput } from './types';

const BP_MAX = 10_000;

function assertValidDate(value: Date, label: string): number {
  const ms = value instanceof Date ? value.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) {
    throw new RangeError(`${label} must be a valid Date`);
  }
  return ms;
}

/**
 * RN-P9: planned progress of one task at `at`: `(at - startsAt)/(endsAt - startsAt)`,
 * clamped to [0, 10000] bp, truncated (Math.trunc semantics, exact via BigInt).
 * Before start -> 0; at/after end -> 10000. Zero duration: at < end -> 0, else 10000.
 *
 * @throws RangeError on invalid dates or endsAt < startsAt.
 */
export function plannedTaskProgressBp(
  task: { startsAt: Date; endsAt: Date },
  at: Date,
): number {
  const start = assertValidDate(task.startsAt, 'startsAt');
  const end = assertValidDate(task.endsAt, 'endsAt');
  const now = assertValidDate(at, 'at');
  if (end < start) {
    throw new RangeError('endsAt must be >= startsAt');
  }
  if (now >= end) return BP_MAX;
  if (now <= start) return 0;
  // start < now < end, so duration > 0.
  const result = (BigInt(now - start) * BigInt(BP_MAX)) / BigInt(end - start);
  return Number(result);
}

/**
 * RN-P9: planned progress of a group of tasks at `at`, aggregated with the same helper as
 * actual progress (weighted or simple mean; RN-P6; mixed -> MixedWeightGroupError).
 * Empty -> 0.
 *
 * @throws RangeError on invalid dates or endsAt < startsAt.
 */
export function plannedProgress(
  tasks: ReadonlyArray<ScheduledTaskInput>,
  at: Date,
): number {
  assertValidDate(at, 'at');
  const items = tasks.map((task) => ({
    weightBp: task.weightBp,
    progressBp: plannedTaskProgressBp(task, at),
  }));
  return aggregateProgressBp(items, 'task');
}
