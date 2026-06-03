import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query parameters for `GET /api/v1/audit/events`.
 * All fields are optional. Pagination uses opaque cursor (base64 of `${occurredAt}|${id}`).
 */
export class ListAuditEventsQueryDto {
  /** Opaque base64 cursor from a previous response's `nextCursor` field. */
  @IsString()
  @IsOptional()
  cursor?: string;

  /** Number of events to return. Default 50, max 200. */
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsString()
  @IsOptional()
  actorId?: string;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsString()
  @IsOptional()
  action?: string;

  /** ISO-8601 lower bound (inclusive). */
  @IsDateString()
  @IsOptional()
  occurredAfter?: string;

  /** ISO-8601 upper bound (inclusive). */
  @IsDateString()
  @IsOptional()
  occurredBefore?: string;
}
