export interface PeriodSummaryDto {
  id: string;
  organizationId: string;
  /** Free-form label, 1–50 chars. */
  code: string;
  status: 'open' | 'closed' | 'future';
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt: string;
}

export interface PeriodDetailDto extends PeriodSummaryDto {
  closedAt: string | null;
  closedByUserId: string | null;
  /** ISO-8601 UTC. Null when not soft-deleted. */
  deletedAt?: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** Request body for POST /api/v1/orgs/:orgId/periods. Creates in status='future'. */
export interface CreatePeriodDto {
  /** Free-form label, 1–50 chars. */
  code: string;
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt: string;
}
