import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { PeriodService } from './period.service.js';

/**
 * PeriodAutoCloseCron — hourly job that closes periods whose endsAt has passed.
 *
 * Finds all open periods where endsAt <= NOW() AND deletedAt IS NULL and calls
 * closePeriod(reason='automatic') for each. Errors in individual closes are logged
 * and execution continues (fault isolation — one failure does not block others).
 *
 * Cadence controlled by env var PERIOD_AUTO_CLOSE_CRON (default: hourly '0 * * * *').
 */
@Injectable()
export class PeriodAutoCloseCron {
  private readonly logger = new Logger(PeriodAutoCloseCron.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly periodService: PeriodService,
  ) {}

  @Cron(process.env['PERIOD_AUTO_CLOSE_CRON'] ?? '0 * * * *', {
    name: 'period-auto-close',
  })
  async handleAutoClose(): Promise<void> {
    const now = new Date();

    const expiredPeriods = await this.prismaService.raw.period.findMany({
      where: {
        status: 'open',
        endsAt: { lte: now },
        deletedAt: null,
      },
      select: { id: true, code: true, organizationId: true },
    });

    if (expiredPeriods.length === 0) {
      return;
    }

    this.logger.log(`Auto-closing ${expiredPeriods.length} expired period(s).`);

    for (const period of expiredPeriods) {
      try {
        await this.periodService.closePeriod(
          period.id,
          {
            userId: 'system',
            auth0Sub: 'system',
            email: 'system',
            displayName: 'System',
            isSuperadmin: true,
            organizationId: period.organizationId,
            permissions: [],
            requestId: `cron-auto-close-${period.id}`,
          },
          'automatic',
        );
        this.logger.log(`Auto-closed period ${period.code} (${period.id}).`);
      } catch (err: unknown) {
        this.logger.error(
          `Failed to auto-close period ${period.code} (${period.id}): ${String(err)}`,
        );
      }
    }
  }
}
