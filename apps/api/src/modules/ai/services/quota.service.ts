import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../auth/prisma/prisma.service.js';

export interface UsageStats {
  used: number;
  limit: number;
  percentage: number;
  resetsAt: string;
}

function currentYearMonth(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

function nextMonthFirstDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws ForbiddenException('AiQuotaExceeded') if the org has reached or
   * exceeded its monthly token quota. Creates a default settings row if none exists.
   */
  async assertWithinQuota(orgId: string): Promise<void> {
    const settings = await this.getOrCreateSettings(orgId);

    if (!settings.enabled) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'AI_DISABLED',
        message: 'El copilot AI está deshabilitado para esta organización.',
      });
    }

    // 0 = unlimited (superadmin bypass)
    if (settings.monthlyTokenQuota === 0) return;

    const yearMonth = currentYearMonth();
    const counters = await this.prisma.raw.usageCounter.findMany({
      where: { organizationId: orgId, yearMonth },
    });

    const totalUsed = counters.reduce((sum, c) => sum + c.tokensInTotal + c.tokensOutTotal, 0);

    if (totalUsed >= settings.monthlyTokenQuota) {
      this.logger.warn(
        `Org ${orgId} exceeded AI quota: ${totalUsed}/${settings.monthlyTokenQuota} tokens in ${yearMonth}`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'AI_QUOTA_EXCEEDED',
        message:
          'La organización alcanzó el límite mensual de uso del copilot AI. Se restablece el primer día del próximo mes.',
      });
    }
  }

  /**
   * Upserts the UsageCounter row for the current month and operation type,
   * incrementing all relevant counters atomically.
   */
  async incrementUsage(
    orgId: string,
    operationType: 'draft' | 'validate',
    tokensIn: number,
    tokensOut: number,
  ): Promise<void> {
    const yearMonth = currentYearMonth();

    await this.prisma.raw.usageCounter.upsert({
      where: {
        organizationId_yearMonth_operationType: {
          organizationId: orgId,
          yearMonth,
          operationType,
        },
      },
      update: {
        callsCount: { increment: 1 },
        tokensInTotal: { increment: tokensIn },
        tokensOutTotal: { increment: tokensOut },
        updatedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        yearMonth,
        operationType,
        callsCount: 1,
        tokensInTotal: tokensIn,
        tokensOutTotal: tokensOut,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Returns aggregated usage stats for the current month for the org admin dashboard.
   */
  async getUsage(orgId: string): Promise<UsageStats> {
    const settings = await this.getOrCreateSettings(orgId);
    const yearMonth = currentYearMonth();

    const counters = await this.prisma.raw.usageCounter.findMany({
      where: { organizationId: orgId, yearMonth },
    });

    const used = counters.reduce((sum, c) => sum + c.tokensInTotal + c.tokensOutTotal, 0);
    const limit = settings.monthlyTokenQuota;
    const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const resetsAt = nextMonthFirstDay().toISOString();

    return { used, limit, percentage, resetsAt };
  }

  private async getOrCreateSettings(orgId: string) {
    const existing = await this.prisma.raw.organizationAiSettings.findUnique({
      where: { organizationId: orgId },
    });

    if (existing) return existing;

    this.logger.log(`Creating default AI settings for org ${orgId}`);
    return this.prisma.raw.organizationAiSettings.create({
      data: {
        organizationId: orgId,
        provider: 'anthropic',
        modelName: 'claude-haiku-4-5-20251001',
        monthlyTokenQuota: 500000,
        monthlyCallQuota: 1000,
        enabled: true,
      },
    });
  }
}
