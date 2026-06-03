import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { AiService } from '../services/ai.service.js';
import { QuotaService } from '../services/quota.service.js';
import { DraftDto } from '../dto/draft.dto.js';
import { ValidateDto } from '../dto/validate.dto.js';

/**
 * Narrows organizationId from string | null to string.
 * TenantGuard ensures this is always populated for AI endpoints.
 */
function requireOrgId(user: AuthContext): string {
  if (!user.organizationId) {
    throw new ForbiddenException('Organization context required');
  }
  return user.organizationId;
}

/**
 * AiController — exposes the AI copilot endpoints for drafting and validating
 * OKR Objectives and Key Results.
 *
 * Guards: TenantGuard (org scoping) + PermissionsGuard (permission check).
 * Rate limit: 10 req/min per user via named throttler 'ai' (ADR-0005 D12).
 *
 * Per ADR-0005.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly quotaService: QuotaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /api/v1/ai/draft
   * Drafts a new Objective or Key Result text based on a user hint.
   */
  @Post('draft')
  @Permissions('ai:use')
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  async draft(@Body() body: DraftDto, @CurrentUser() user: AuthContext) {
    return this.aiService.draft({
      orgId: requireOrgId(user),
      userId: user.userId,
      entityType: body.entityType,
      hint: body.hint,
      objectiveContext: body.objectiveContext,
    });
  }

  /**
   * POST /api/v1/ai/validate
   * Returns structured SMART feedback for a given Objective or Key Result text.
   */
  @Post('validate')
  @Permissions('ai:use')
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  async validate(@Body() body: ValidateDto, @CurrentUser() user: AuthContext) {
    return this.aiService.validate({
      orgId: requireOrgId(user),
      userId: user.userId,
      entityType: body.entityType,
      text: body.text,
    });
  }

  /**
   * GET /api/v1/ai/usage
   * Returns current-month usage stats for the org admin dashboard.
   */
  @Get('usage')
  @Permissions('ai:admin')
  async getUsage(@CurrentUser() user: AuthContext) {
    return this.quotaService.getUsage(requireOrgId(user));
  }

  /**
   * GET /api/v1/ai/status
   * Returns whether the AI copilot is configured and which provider is active.
   * Used by the frontend to conditionally show/hide AI features.
   */
  @Get('status')
  @Permissions('ai:use')
  getStatus() {
    const provider = this.configService.get<string>('AI_DEFAULT_PROVIDER') ?? 'anthropic';
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const enabled = Boolean(apiKey && apiKey.trim().length > 0);
    return { enabled, provider };
  }
}
