/** Query string for GET /api/v1/okr/objectives. */
export interface ListObjectivesQueryDto {
  /** Period code "YYYY-Qn". Defaults server-side to current open period (RN-24). */
  period?: string;
}
