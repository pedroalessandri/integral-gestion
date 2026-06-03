import {
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../modules/auth/prisma/prisma.service.js';
import { tenantContextStorage } from '../../modules/auth/context/tenant-context-storage.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * Dev-only middleware that simulates an authenticated user without requiring
 * a real Auth0 JWT. Reads the following headers:
 *
 *   X-Dev-User-Id        — required; identifies the acting user
 *   X-Dev-Org-Id         — optional; the organization context
 *   X-Dev-Is-Superadmin  — optional; 'true' to grant superadmin
 *
 * If X-Dev-User-Id doesn't resolve to an existing core.user row, the middleware
 * lazy-creates one with:
 *   auth0_sub    = 'dev:<userId>'
 *   email        = 'dev-<userId>@example.com'
 *   display_name = 'Dev User <userId>'
 *
 * WARN is logged on lazy-create.
 *
 * This middleware must NEVER be registered in production (NODE_ENV === 'production').
 * Registration is guarded in AppModule.configure().
 *
 * Per plan step 8.
 */
@Injectable()
export class DevAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DevAuthMiddleware.name);

  constructor(private readonly prismaService: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const userId = req.headers['x-dev-user-id'];
    if (!userId || typeof userId !== 'string') {
      // No dev user header — pass through without setting context
      next();
      return;
    }

    const orgId = req.headers['x-dev-org-id'];
    const isSuperadminHeader = req.headers['x-dev-is-superadmin'];
    const isSuperadmin =
      typeof isSuperadminHeader === 'string' &&
      isSuperadminHeader.toLowerCase() === 'true';

    // Read X-Request-Id directly from req.headers (middleware runs before interceptors)
    const requestIdRaw = req.headers['x-request-id'];
    const requestId =
      typeof requestIdRaw === 'string' ? requestIdRaw : `dev-req-${Date.now()}`;

    // Resolve or lazy-create the core.user record using raw client (bypass tenant extension)
    let user = await this.prismaService.raw.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.warn(
        `[DevAuth] No user found with id=${userId}. Lazy-creating dev user.`,
      );
      user = await this.prismaService.raw.user.create({
        data: {
          id: userId,
          auth0Sub: `dev:${userId}`,
          email: `dev-${userId}@example.com`,
          displayName: `Dev User ${userId}`,
          isSuperadmin,
          lastSeenAt: new Date(),
        },
      });
    }

    const authCtx: AuthContext = {
      userId: user.id,
      auth0Sub: user.auth0Sub,
      email: user.email,
      displayName: user.displayName,
      isSuperadmin: user.isSuperadmin || isSuperadmin,
      organizationId: typeof orgId === 'string' ? orgId : null,
      permissions: user.isSuperadmin || isSuperadmin ? ['*'] : [],
      requestId,
    };

    tenantContextStorage.enterWith(authCtx);
    (req as unknown as Record<string, unknown>)['authContext'] = authCtx;
    next();
  }
}
