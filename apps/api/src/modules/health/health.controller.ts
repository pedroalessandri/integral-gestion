import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../auth/prisma/prisma.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

/**
 * HealthController — liveness and readiness probes.
 *
 * Both endpoints skip throttling (@SkipThrottle) since they are called frequently
 * by infrastructure (load balancers, k8s probes, uptime monitors).
 *
 * These endpoints are intentionally public (no auth guard) — health probes must
 * work without a valid JWT. This is a deliberate exception to the default-deny rule;
 * no business data is exposed.
 */
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * GET /api/v1/health — liveness probe.
   * Returns 200 as long as the process is running (no DB check).
   */
  @Get()
  liveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/health/ready — readiness probe.
   * Checks DB connectivity with SELECT 1. Returns 503 if DB is unreachable.
   */
  @Get('ready')
  async readiness(): Promise<{
    status: string;
    db: string;
    timestamp: string;
  }> {
    try {
      await this.prismaService.raw.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
