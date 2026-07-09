import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { MetricEntryDto, MetricFrequency } from '@gestion-publica/shared-types/metrics';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  formatDecimal4,
  isValidBucketDate,
  parseDecimal4,
  toUTCMidnight,
} from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';

type PeriodInclude = {
  id: string;
  code: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

type MetricWithPeriod = {
  id: string;
  organizationId: string;
  frequency: string;
  baselineValue: { toString(): string };
  period: PeriodInclude;
};

type EntryRow = {
  id: string;
  metricId: string;
  organizationId: string;
  bucketDate: Date;
  incrementValue: { toString(): string };
  comment: string | null;
  createdByUserId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const METRIC_PERIOD_SELECT = {
  id: true,
  organizationId: true,
  frequency: true,
  baselineValue: true,
  period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
} as const;

@Injectable()
export class MetricEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  async list(metricId: string, orgId: string): Promise<MetricEntryDto[]> {
    const metric = await this.findMetricOrThrow(metricId, orgId);
    const entries = await this.findActiveEntries(metricId);
    return this.toDtos(metric, entries);
  }

  async create(
    metricId: string,
    orgId: string,
    dto: { bucketDate: string; incrementValue: string; comment?: string },
    authContext: AuthContext,
  ): Promise<MetricEntryDto> {
    const metric = await this.findMetricOrThrow(metricId, orgId);
    assertPeriodOpen(this.toMinimalPeriod(metric.period));

    const bucketDate = toUTCMidnight(new Date(dto.bucketDate));
    this.assertValidBucket(bucketDate, metric);

    const created = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const entry = (await tx.metricEntry.create({
          data: {
            metricId,
            organizationId: orgId,
            bucketDate,
            incrementValue: dto.incrementValue,
            comment: dto.comment?.trim() ? dto.comment : null,
            createdByUserId: authContext.userId,
          },
        })) as EntryRow;

        await this.auditEmitter.emit({
          action: 'metric.entry.created',
          entityType: 'metrics.metric_entry',
          entityId: entry.id,
          diff: {
            before: null,
            after: {
              metricId,
              bucketDate: entry.bucketDate.toISOString(),
              incrementValue: entry.incrementValue.toString(),
              comment: entry.comment,
            },
          },
        });

        return entry;
      }),
    );

    return this.toDtoWithCumulative(metric, created);
  }

  async update(
    metricId: string,
    entryId: string,
    orgId: string,
    dto: { incrementValue?: string; comment?: string },
    authContext: AuthContext,
  ): Promise<MetricEntryDto> {
    const metric = await this.findMetricOrThrow(metricId, orgId);
    assertPeriodOpen(this.toMinimalPeriod(metric.period));
    const existing = await this.findEntryOrThrow(metricId, entryId, orgId);

    const updated = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const entry = (await tx.metricEntry.update({
          where: { id: entryId },
          data: {
            ...(dto.incrementValue !== undefined && { incrementValue: dto.incrementValue }),
            ...(dto.comment !== undefined && {
              comment: dto.comment.trim() ? dto.comment : null,
            }),
          },
        })) as EntryRow;

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.incrementValue !== undefined) {
          before['incrementValue'] = existing.incrementValue.toString();
          after['incrementValue'] = dto.incrementValue;
        }
        if (dto.comment !== undefined) {
          before['comment'] = existing.comment;
          after['comment'] = entry.comment;
        }

        if (Object.keys(after).length > 0) {
          await this.auditEmitter.emit({
            action: 'metric.entry.updated',
            entityType: 'metrics.metric_entry',
            entityId: entryId,
            diff: { before, after },
          });
        }

        return entry;
      }),
    );

    return this.toDtoWithCumulative(metric, updated);
  }

  async softDelete(
    metricId: string,
    entryId: string,
    orgId: string,
    authContext: AuthContext,
  ): Promise<void> {
    const metric = await this.findMetricOrThrow(metricId, orgId);
    assertPeriodOpen(this.toMinimalPeriod(metric.period));
    await this.findEntryOrThrow(metricId, entryId, orgId);

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.metricEntry.update({
          where: { id: entryId },
          data: { deletedAt: new Date() },
        });

        await this.auditEmitter.emit({
          action: 'metric.entry.deleted',
          entityType: 'metrics.metric_entry',
          entityId: entryId,
          diff: {
            before: { deletedAt: null },
            after: { deletedAt: new Date().toISOString() },
          },
        });
      }),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findMetricOrThrow(metricId: string, orgId: string): Promise<MetricWithPeriod> {
    const metric = (await this.prisma.scoped.metric.findFirst({
      where: { id: metricId, organizationId: orgId, deletedAt: null },
      select: METRIC_PERIOD_SELECT,
    })) as MetricWithPeriod | null;
    if (!metric) {
      throw new NotFoundException(`Metric ${metricId} not found`);
    }
    return metric;
  }

  private async findEntryOrThrow(
    metricId: string,
    entryId: string,
    orgId: string,
  ): Promise<EntryRow> {
    const entry = (await this.prisma.scoped.metricEntry.findFirst({
      where: { id: entryId, metricId, organizationId: orgId, deletedAt: null },
    })) as EntryRow | null;
    if (!entry) {
      throw new NotFoundException(`Metric entry ${entryId} not found`);
    }
    return entry;
  }

  private assertValidBucket(bucketDate: Date, metric: MetricWithPeriod): void {
    const range = { startsAt: metric.period.startsAt, endsAt: metric.period.endsAt };
    if (!isValidBucketDate(bucketDate, range, metric.frequency as MetricFrequency)) {
      throw new UnprocessableEntityException(
        `InvalidBucketDate: "${bucketDate.toISOString().slice(0, 10)}" no es un inicio de bucket válido para la frecuencia "${metric.frequency}" dentro del período ${metric.period.code}.`,
      );
    }
  }

  private async findActiveEntries(metricId: string): Promise<EntryRow[]> {
    return (await this.prisma.scoped.metricEntry.findMany({
      where: { metricId, deletedAt: null },
      orderBy: [{ bucketDate: 'asc' }, { createdAt: 'asc' }],
    })) as EntryRow[];
  }

  /** Maps entries to DTOs with running cumulative (chronological order) and author info. */
  private async toDtos(metric: MetricWithPeriod, entries: EntryRow[]): Promise<MetricEntryDto[]> {
    const userIds = [...new Set(entries.map((e) => e.createdByUserId))];
    const users = userIds.length
      ? await this.prisma.raw.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const usersById = new Map(users.map((u) => [u.id, u]));

    let running = parseDecimal4(metric.baselineValue.toString());
    return entries.map((entry) => {
      running += parseDecimal4(entry.incrementValue.toString());
      const user = usersById.get(entry.createdByUserId);
      return {
        id: entry.id,
        metricId: entry.metricId,
        bucketDate: entry.bucketDate.toISOString(),
        incrementValue: entry.incrementValue.toString(),
        cumulativeAfter: formatDecimal4(running),
        comment: entry.comment,
        createdBy: user ? { id: user.id, displayName: user.displayName } : null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };
    });
  }

  /** Returns the DTO of a single (just created/updated) entry with its cumulative. */
  private async toDtoWithCumulative(
    metric: MetricWithPeriod,
    entry: EntryRow,
  ): Promise<MetricEntryDto> {
    const dtos = await this.toDtos(metric, await this.findActiveEntries(entry.metricId));
    const dto = dtos.find((d) => d.id === entry.id);
    if (!dto) {
      // The entry was just written by this service — absence is a programming error.
      throw new NotFoundException(`Metric entry ${entry.id} not found after write`);
    }
    return dto;
  }

  private toMinimalPeriod(period: PeriodInclude): {
    id: string;
    status: 'open' | 'closed' | 'future';
    code: string;
  } {
    return {
      id: period.id,
      status: period.status as 'open' | 'closed' | 'future',
      code: period.code,
    };
  }
}
