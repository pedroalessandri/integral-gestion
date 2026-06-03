/**
 * Standard error response shape across all APIs.
 * Consistent across ADR 0001/0002/0003/0004.
 */
export interface ErrorResponseDto {
  /** HTTP status code. */
  statusCode: number;
  /** Human-readable message. */
  message: string;
  /**
   * Machine-readable error code.
   * e.g. 'WeightSumInvariant', 'OrgSlugTaken', 'JwtExpired', 'OrganizationNotFound'.
   */
  error: string;
  /** Optional domain-specific context. */
  details?: Record<string, unknown>;
}
