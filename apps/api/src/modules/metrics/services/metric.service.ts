import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  MetricDetailDto,
  MetricDirection,
  MetricFrequency,
  MetricSeriesDto,
  MetricSummaryDto,
  MetricUnit,
} from '@gestion-publica/shared-types/metrics';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  buildBuckets,
  cumulativeSeries,
  deviationBp,
  expectedAt,
  formatDecimal4,
  parseDecimal4,
  progressBp,
  toUTCMidnight,
  type PeriodRange,
} from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { PeriodService } from '../../core/index.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import type { CreateMetricDto } from '../dto/create-metric.dto.js';
import type { UpdateMetricDto } from '../dto/update-metric.dto.js';
import type { ListMetricsQueryDto } from '../dto/list-metrics-query.dto.js';

type PeriodInclude = {
  id: string;
  code: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

type MetricRow = {
  id: string;
  organizationId: string;
  periodId: string;
  name: string;
  unit: string;
  direction: string;
  frequency: string;
  baselineValue: { toString(): string };
  targetValue: { toString(): string };
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  period: PeriodInclude;
};

const METRIC_PERIOD_INCLUDE = {
  period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
} as const;

@Injectable()
export class MetricService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodService: PeriodService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  async list(orgId: string, query: ListMetricsQueryDto): Promise<MetricSummaryDto[]> {
    const metrics = (await this.prisma.scoped.metric.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(query.frequency && { frequency: query.frequency }),
      },
      include: METRIC_PERIOD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })) as MetricRow[];

    const sums = await this.sumEntriesByMetric(metrics.map((m) => m.id));
    return metrics.map((m) => this.toSummaryDto(m, sums.get(m.id) ?? 0n));
  }

  async getById(id: string, orgId: string): Promise<MetricDetailDto> {
    const metric = await this.findActiveOrThrow(id, orgId);
    const sums = await this.sumEntriesByMetric([metric.id]);
    return this.toDetailDto(metric, sums.get(metric.id) ?? 0n);
  }

  async create(
    orgId: string,
    dto: CreateMetricDto,
    authContext: AuthContext,
  ): Promise<MetricDetailDto> {
    const period = await this.periodService.getCurrentOpenPeriod(orgId);
    if (!period) {
      throw new UnprocessableEntityException(
        'No hay un período abierto para esta organización. Abrí un período antes de crear indicadores.',
      );
    }

    await this.assertNameAvailable(orgId, period.id, dto.name);

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const metric = (await tx.metric.create({
          data: {
            organizationId: orgId,
            periodId: period.id,
            name: dto.name,
            unit: dto.unit,
            direction: dto.direction,
            frequency: dto.frequency,
            baselineValue: dto.baselineValue ?? '0',
            targetValue: dto.targetValue,
          },
          include: METRIC_PERIOD_INCLUDE,
        })) as MetricRow;

        await this.auditEmitter.emit({
          action: 'metric.created',
          entityType: 'metrics.metric',
          entityId: metric.id,
          diff: {
            before: null,
            after: {
              name: metric.name,
              unit: metric.unit,
              direction: metric.direction,
              frequency: metric.frequency,
              baselineValue: metric.baselineValue.toString(),
              targetValue: metric.targetValue.toString(),
              periodId: metric.periodId,
            },
          },
        });

        return this.toDetailDto(metric, 0n);
      }),
    );
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateMetricDto,
    authContext: AuthContext,
  ): Promise<MetricDetailDto> {
    const existing = await this.findActiveOrThrow(id, orgId);
    assertPeriodOpen(this.toMinimalPeriod(existing.period));

    if (dto.name !== undefined && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameAvailable(orgId, existing.periodId, dto.name, id);
    }

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const updated = (await tx.metric.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.baselineValue !== undefined && { baselineValue: dto.baselineValue }),
            ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
          },
          include: METRIC_PERIOD_INCLUDE,
        })) as MetricRow;

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.name !== undefined) {
          before['name'] = existing.name;
          after['name'] = dto.name;
        }
        if (dto.baselineValue !== undefined) {
          before['baselineValue'] = existing.baselineValue.toString();
          after['baselineValue'] = dto.baselineValue;
        }
        if (dto.targetValue !== undefined) {
          before['targetValue'] = existing.targetValue.toString();
          after['targetValue'] = dto.targetValue;
        }

        if (Object.keys(after).length > 0) {
          await this.auditEmitter.emit({
            action: 'metric.updated',
            entityType: 'metrics.metric',
            entityId: id,
            diff: { before, after },
          });
        }

        const sums = await this.sumEntriesByMetric([id]);
        return this.toDetailDto(updated, sums.get(id) ?? 0n);
      }),
    );
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.findActiveOrThrow(id, orgId);
    assertPeriodOpen(this.toMinimalPeriod(existing.period));

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.metric.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        await this.auditEmitter.emit({
          action: 'metric.deleted',
          entityType: 'metrics.metric',
          entityId: id,
          diff: {
            before: { deletedAt: null },
            after: { deletedAt: new Date().toISOString() },
          },
        });
      }),
    );
  }

  async getSeries(id: string, orgId: string): Promise<MetricSeriesDto> {
    const metric = await this.findActiveOrThrow(id, orgId);
    const entries = (await this.prisma.scoped.metricEntry.findMany({
      where: { metricId: id, deletedAt: null },
      orderBy: [{ bucketDate: 'asc' }, { createdAt: 'asc' }],
      select: { bucketDate: true, incrementValue: true },
    })) as Array<{ bucketDate: Date; incrementValue: { toString(): string } }>;

    const range = this.toRange(metric.period);
    const baseline = metric.baselineValue.toString();
    const target = metric.targetValue.toString();

    const domainEntries = entries.map((e) => ({
      bucketDate: e.bucketDate,
      incrementValue: e.incrementValue.toString(),
    }));

    // Expected curve sampled at every bucket boundary plus the period end.
    const samplePoints = buildBuckets(range, metric.frequency as MetricFrequency);
    const endPoint = toUTCMidnight(range.endsAt);
    if (samplePoints[samplePoints.length - 1]?.getTime() !== endPoint.getTime()) {
      samplePoints.push(endPoint);
    }
    const expected = samplePoints.map((d) => ({
      date: d.toISOString(),
      value: expectedAt(d, range, baseline, target),
    }));

    const actual = cumulativeSeries(domainEntries, baseline).map((p) => ({
      bucketDate: p.bucketDate.toISOString(),
      cumulativeValue: p.cumulativeValue,
    }));

    const now = new Date();
    const cumulative = this.lastValue(metric, this.sumIncrements(domainEntries));
    const expectedToDate = expectedAt(now, range, baseline, target);
    const deviationPct =
      deviationBp({ actual: cumulative, expected: expectedToDate, baseline, target }) / 100;

    return { expected, actual, summary: { cumulative, expectedToDate, deviationPct } };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findActiveOrThrow(id: string, orgId: string): Promise<MetricRow> {
    const metric = (await this.prisma.scoped.metric.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: METRIC_PERIOD_INCLUDE,
    })) as MetricRow | null;
    if (!metric) {
      throw new NotFoundException(`Metric ${id} not found`);
    }
    return metric;
  }

  /** RN-M1: name unique per (org, period), case-insensitive, among non-deleted metrics. */
  private async assertNameAvailable(
    orgId: string,
    periodId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.scoped.metric.findFirst({
      where: {
        organizationId: orgId,
        periodId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `Ya existe un indicador llamado "${name}" en este período.`,
      );
    }
  }

  private async sumEntriesByMetric(metricIds: string[]): Promise<Map<string, bigint>> {
    if (metricIds.length === 0) return new Map();
    const entries = (await this.prisma.scoped.metricEntry.findMany({
      where: { metricId: { in: metricIds }, deletedAt: null },
      select: { metricId: true, incrementValue: true },
    })) as Array<{ metricId: string; incrementValue: { toString(): string } }>;

    const sums = new Map<string, bigint>();
    for (const entry of entries) {
      const current = sums.get(entry.metricId) ?? 0n;
      sums.set(entry.metricId, current + parseDecimal4(entry.incrementValue.toString()));
    }
    return sums;
  }

  private sumIncrements(entries: Array<{ incrementValue: string }>): bigint {
    return entries.reduce((acc, e) => acc + parseDecimal4(e.incrementValue), 0n);
  }

  private lastValue(metric: MetricRow, incrementsSum: bigint): string {
    return formatDecimal4(parseDecimal4(metric.baselineValue.toString()) + incrementsSum);
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

  private toRange(period: PeriodInclude): PeriodRange {
    return { startsAt: period.startsAt, endsAt: period.endsAt };
  }

  private toSummaryDto(metric: MetricRow, incrementsSum: bigint): MetricSummaryDto {
    const baseline = metric.baselineValue.toString();
    const target = metric.targetValue.toString();
    const lastValue = this.lastValue(metric, incrementsSum);
    const range = this.toRange(metric.period);

    return {
      id: metric.id,
      name: metric.name,
      unit: metric.unit as MetricUnit,
      direction: metric.direction as MetricDirection,
      frequency: metric.frequency as MetricFrequency,
      baselineValue: baseline,
      targetValue: target,
      lastValue,
      expectedToDate: expectedAt(new Date(), range, baseline, target),
      progressPct: Math.trunc(progressBp({ actual: lastValue, baseline, target }) / 100),
      linkedKrCount: 0,
      period: {
        id: metric.period.id,
        code: metric.period.code,
        status: metric.period.status as 'open' | 'closed' | 'future',
        startsAt: metric.period.startsAt.toISOString(),
        endsAt: metric.period.endsAt.toISOString(),
      },
      createdAt: metric.createdAt.toISOString(),
    };
  }

  private toDetailDto(metric: MetricRow, incrementsSum: bigint): MetricDetailDto {
    return {
      ...this.toSummaryDto(metric, incrementsSum),
      organizationId: metric.organizationId,
      periodId: metric.periodId,
      buckets: buildBuckets(this.toRange(metric.period), metric.frequency as MetricFrequency).map(
        (d) => d.toISOString(),
      ),
      updatedAt: metric.updatedAt.toISOString(),
    };
  }
}
