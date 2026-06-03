import { Controller, Get } from '@nestjs/common';
import { MeService } from '../services/me.service.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * MeController — returns the authenticated user's profile and org memberships.
 *
 * No TenantGuard — this is the discovery endpoint for org membership.
 * TODO(ADR-0004): @UseGuards(AuthGuard) (auth only, no tenant scoping)
 */
@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  /**
   * GET /api/v1/me
   * Returns the authenticated user's profile and all org memberships.
   * TODO(ADR-0004): @UseGuards(AuthGuard)
   */
  @Get()
  async getMe(@CurrentUser() user: AuthContext) {
    return this.meService.getMe(user.userId);
  }
}
