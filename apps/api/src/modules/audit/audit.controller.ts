import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import type {
  AuditEventDto,
  AuditEventListDto,
} from '@gestion-publica/shared-types/audit';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto.js';
import { AuditQueryService } from './services/audit-query.service.js';
import { AuditReadAccessGuard } from './guards/audit-read-access.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

/**
 * Exposes read-only audit event endpoints per ADR 0003 "Read API".
 *
 * Both endpoints are protected by AuditReadAccessGuard (stub until ADR-0004 lands).
 * Scoping (superadmin vs. org-scoped) is enforced inside AuditQueryService.
 */
@Controller('audit')
@UseGuards(AuditReadAccessGuard)
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  /**
   * GET /api/v1/audit/events
   * Returns a cursor-paginated list of audit events visible to the caller.
   */
  @Get('events')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async listEvents(
    @Query() query: ListAuditEventsQueryDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AuditEventListDto> {
    return this.auditQueryService.listEvents(
      query,
      user.organizationId,
      user.isSuperadmin,
    );
  }

  /**
   * GET /api/v1/audit/events/:id
   * Returns a single audit event by id, scoped to the caller's access.
   */
  @Get('events/:id')
  async getEvent(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<AuditEventDto> {
    const event = await this.auditQueryService.getEventById(
      id,
      user.organizationId,
      user.isSuperadmin,
    );
    if (!event) throw new NotFoundException();
    return event;
  }
}
