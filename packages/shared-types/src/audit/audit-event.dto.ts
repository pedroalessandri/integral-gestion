/**
 * Response shape for `GET /api/v1/audit/events/:id` and each element inside
 * `AuditEventListDto.items` returned by `GET /api/v1/audit/events`.
 * Shape per ADR 0003 "Read API" (`AuditEventDto`).
 *
 * `diff` is typed as `Record<string, unknown>` (not the internal `DomainEvent` union)
 * because the API returns raw JSONB and must remain stable as new event variants are
 * added server-side. Consumers narrow via `entityType` + `action`.
 */
export interface AuditEventDto {
  id: string;
  /** ISO-8601 UTC. */
  occurredAt: string;
  actorId: string;
  /** Denormalized via LEFT JOIN core.user at read time. Not persisted in audit.event. */
  actorEmail: string;
  organizationId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  /** Free-form JSONB; UI interprets per entityType/action. */
  diff: Record<string, unknown>;
  requestId: string;
}

/**
 * Response body for `GET /api/v1/audit/events` — paginated list with opaque cursor.
 * Shape per ADR 0003 "Read API".
 */
export interface AuditEventListDto {
  items: AuditEventDto[];
  /** Base64 of `${occurredAt}|${id}`. Null when no more pages. */
  nextCursor: string | null;
}
