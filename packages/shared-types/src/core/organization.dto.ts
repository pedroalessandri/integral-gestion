export interface OrganizationSummaryDto {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'inactive';
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

export interface OrganizationDetailDto extends OrganizationSummaryDto {
  deactivatedAt: string | null;
  deactivatedByUserId: string | null;
  /** ISO-8601 UTC timestamp. */
  updatedAt: string;
  mission: string | null;
  vision: string | null;
  values: string | null;
  /** Arbitrary additional context for the LLM (strategic priorities, etc.) */
  context: string | null;
}

/** Request body for POST /api/v1/orgs. Creates org and first Period atomically (D8). */
export interface CreateOrganizationDto {
  slug: string;
  name: string;
  /** Required: first period must be provided at org creation time. */
  firstPeriod: {
    /** Free string, 1-50 chars. */
    code: string;
    /** ISO-8601 UTC midnight. */
    startsAt: string;
    /** ISO-8601 UTC midnight. */
    endsAt: string;
  };
}

/** Request body for PATCH /api/v1/orgs/:id. Slug is immutable in MVP. */
export interface UpdateOrganizationDto {
  name?: string;
  mission?: string | null;
  vision?: string | null;
  values?: string | null;
  /** Arbitrary additional context for the LLM (strategic priorities, etc.) */
  context?: string | null;
}

/** Request body for POST /api/v1/orgs/:id/deactivate. */
export interface DeactivateOrganizationDto {
  reason?: string;
}
