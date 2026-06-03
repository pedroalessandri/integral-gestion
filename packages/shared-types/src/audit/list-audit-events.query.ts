export interface ListAuditEventsQueryDto {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  /** Ignored if caller is org-admin (forced to their org). */
  organizationId?: string;
  action?: string;
  /** ISO-8601 UTC. */
  occurredAfter?: string;
  /** ISO-8601 UTC. */
  occurredBefore?: string;
  /** Default 50, max 200. */
  limit?: number;
  /** Opaque cursor (base64 of `${occurredAt}|${id}`). */
  cursor?: string;
}
