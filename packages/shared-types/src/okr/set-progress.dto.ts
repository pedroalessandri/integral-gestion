/** Request body for PUT /api/v1/okr/tasks/:id/progress. Idempotent by final value (RN-29). */
export interface SetTaskProgressDto {
  /** Integer 0..10000. Clients sending % convert client-side via Math.trunc(pct*100) per RN-22. */
  progressBp: number;
}
