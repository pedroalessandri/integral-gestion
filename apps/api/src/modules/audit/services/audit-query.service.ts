import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import type { ListAuditEventsQueryDto } from '../dto/list-audit-events-query.dto.js';
import type {
  AuditEventDto,
  AuditEventListDto,
} from '@gestion-publica/shared-types/audit';

const DEFAULT_LIMIT = 50;

/**
 * Decodes an opaque cursor (base64 `${occurredAt}|${id}`) into its components.
 * Returns null if the cursor is absent or malformed.
 */
function decodeCursor(
  cursor: string,
): { occurredAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const separatorIdx = decoded.lastIndexOf('|');
    if (separatorIdx === -1) return null;
    const occurredAtStr = decoded.slice(0, separatorIdx);
    const id = decoded.slice(separatorIdx + 1);
    const occurredAt = new Date(occurredAtStr);
    if (isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

/**
 * Encodes a cursor from an event's occurredAt and id.
 */
function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(`${occurredAt.toISOString()}|${id}`).toString('base64');
}

/**
 * Maps a raw Prisma AuditEvent row (with optional actorEmail join) to AuditEventDto.
 * Since audit.event has no Prisma relation to core.user, the email is provided separately.
 */
function toDto(
  row: {
    id: string;
    occurredAt: Date;
    actorId: string;
    organizationId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    diff: unknown;
    requestId: string;
  },
  actorEmail: string,
): AuditEventDto {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    actorEmail,
    organizationId: row.organizationId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    diff: (row.diff as Record<string, unknown>) ?? {},
    requestId: row.requestId,
  };
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns a cursor-paginated list of audit events.
   *
   * Security:
   * - Non-superadmin callers are always scoped to their own `callerOrgId`.
   * - Superadmin callers may optionally filter by `query.organizationId`.
   *
   * Pagination:
   * - Keyset cursor: `base64(${occurredAt.toISOString()}|${id})`
   * - ORDER BY occurred_at DESC, id DESC (stable when timestamps collide)
   * - Fetches `limit + 1` rows; the extra row signals there is a next page.
   */
  async listEvents(
    query: ListAuditEventsQueryDto,
    callerOrgId: string | null,
    isSuperadmin: boolean,
  ): Promise<AuditEventListDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;

    // Resolve effective organizationId filter.
    const effectiveOrgId: string | null | undefined = isSuperadmin
      ? (query.organizationId ?? undefined)
      : callerOrgId;

    // Decode cursor.
    const cursorData = query.cursor ? decodeCursor(query.cursor) : null;

    // Build Prisma where clause.
    const where = {
      ...(effectiveOrgId !== undefined
        ? { organizationId: effectiveOrgId }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.occurredAfter || query.occurredBefore
        ? {
            occurredAt: {
              ...(query.occurredAfter
                ? { gte: new Date(query.occurredAfter) }
                : {}),
              ...(query.occurredBefore
                ? { lte: new Date(query.occurredBefore) }
                : {}),
            },
          }
        : {}),
      // Keyset pagination: find rows "before" the cursor position.
      ...(cursorData
        ? {
            OR: [
              { occurredAt: { lt: cursorData.occurredAt } },
              {
                occurredAt: cursorData.occurredAt,
                id: { lt: cursorData.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.raw.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

    // Resolve actor emails via a single batched lookup on core.user.
    const actorIds = [...new Set(pageRows.map((r) => r.actorId))];
    const users =
      actorIds.length > 0
        ? await this.prisma.raw.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true },
          })
        : [];

    const emailByActorId = new Map(users.map((u) => [u.id, u.email]));

    const items: AuditEventDto[] = pageRows.map((row) =>
      toDto(row, emailByActorId.get(row.actorId) ?? ''),
    );

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasNextPage && lastRow
        ? encodeCursor(lastRow.occurredAt, lastRow.id)
        : null;

    return { items, nextCursor };
  }

  /**
   * Returns a single audit event by id.
   *
   * Security:
   * - Non-superadmin callers only see events belonging to their own org.
   *   Returns null (caller throws 404) to avoid leaking event existence.
   * - Superadmin callers see any event.
   */
  async getEventById(
    id: string,
    callerOrgId: string | null,
    isSuperadmin: boolean,
  ): Promise<AuditEventDto | null> {
    const row = await this.prisma.raw.auditEvent.findUnique({ where: { id } });
    if (!row) return null;

    if (!isSuperadmin) {
      // Scope check: use null-safe equality so that cross-org leak is impossible.
      if (row.organizationId !== callerOrgId) return null;
    }

    const user = row.actorId
      ? await this.prisma.raw.user.findUnique({
          where: { id: row.actorId },
          select: { email: true },
        })
      : null;

    return toDto(row, user?.email ?? '');
  }
}
