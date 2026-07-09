import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import type {
  MetricContextDto,
  MetricDirection,
  MetricKrLinkDto,
  UpdateMetricKrLinkDto,
  UpsertMetricKrLinkDto,
} from '@gestion-publica/shared-types/metrics';
import {
  computeAutomaticKrProgressBp,
  formatDecimal4,
  parseDecimal4,
} from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { KeyResultService } from '../../okr/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';

type Decimalish = { toString(): string };

type LinkRow = {
  id: string;
  metricId: string;
  keyResultId: string;
  baselineValue: Decimalish;
  targetValue: Decimalish;
  direction: string;
  createdAt: Date;
  updatedAt: Date;
};

type MetricRow = {
  id: string;
  name: string;
  direction: string;
  periodId: string;
};

type KrWithPeriod = {
  id: string;
  periodId: string;
  period: { id: string; code: string; status: 'open' | 'closed' | 'future' };
};

/**
 * MetricLinkService — Módulo 2 "Indicadores en OKRs".
 *
 * Owns the metric↔KR link lifecycle and the metric↔objective context, plus the
 * recompute hook fired after MetricEntry mutations. Writes to okr.key_result go
 * exclusively through KeyResultService (D-O1); this service never mutates the KR
 * row directly. Per docs/features/indicadores-okr.md.
 */
@Injectable()
export class MetricLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyResultService: KeyResultService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  // ── Recompute hook (PASO 4) ──────────────────────────────────────────────

  /**
   * Recompute all automatic KRs linked to `metricId` from the metric's current
   * accumulated value. No-op when the metric has no links. RN-O6: a metric with
   * zero data drives the KR to 0%. Intended to run AFTER the MetricEntry commit.
   */
  async recalcLinkedKrs(
    metricId: string,
    orgId: string,
    authContext: AuthContext,
  ): Promise<void> {
    const snapshot = await tenantContextStorage.run(authContext, async () => {
      const links = (await this.prisma.scoped.metricKrLink.findMany({
        where: { metricId, organizationId: orgId },
        select: { keyResultId: true, baselineValue: true, targetValue: true },
      })) as Array<Pick<LinkRow, 'keyResultId' | 'baselineValue' | 'targetValue'>>;
      if (links.length === 0) {
        return { links, actual: '0', hasData: false };
      }
      const cumulative = await this.currentCumulative(metricId, orgId);
      return { links, ...cumulative };
    });

    for (const link of snapshot.links) {
      const progressBp = this.linkProgress(
        snapshot.actual,
        link.baselineValue.toString(),
        link.targetValue.toString(),
        snapshot.hasData,
      );
      await this.keyResultService.applyAutomaticKrProgress(
        link.keyResultId,
        progressBp,
        authContext,
      );
    }
  }

  // ── Link CRUD (PASO 5) ───────────────────────────────────────────────────

  /**
   * PUT /key-results/:id/metric-link — create or replace the link (RN-O2).
   * Replace semantics follow D-O3: any existing link is hard-deleted (audited)
   * and a fresh row is created. The KR flips to 'automatic' and recomputes now.
   */
  async upsert(
    keyResultId: string,
    orgId: string,
    dto: UpsertMetricKrLinkDto,
    authContext: AuthContext,
  ): Promise<MetricKrLinkDto> {
    const kr = await this.loadKrWithPeriod(keyResultId, orgId);
    assertPeriodOpen(kr.period); // RN-O8
    const metric = await this.loadMetric(dto.metricId, orgId);
    if (metric.periodId !== kr.periodId) {
      throw new UnprocessableEntityException(
        'El indicador y el Key Result deben pertenecer al mismo período (RN-O3).',
      );
    }

    const { actual, hasData } = await this.currentCumulative(dto.metricId, orgId);
    const baseline = dto.baselineValue ?? actual; // RN-O2: default = acumulado actual
    const target = dto.targetValue;
    const direction = (dto.direction ?? metric.direction) as MetricDirection; // RN-O2
    this.assertBaselineTargetDiffer(baseline, target); // §3

    const existing = (await this.prisma.scoped.metricKrLink.findFirst({
      where: { keyResultId, organizationId: orgId },
    })) as LinkRow | null;

    const created = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        if (existing) {
          await tx.metricKrLink.delete({ where: { id: existing.id } });
          await this.auditEmitter.emit({
            action: 'kr.metric_unlinked',
            entityType: 'okr.key_result',
            entityId: keyResultId,
            diff: {
              before: {
                metricId: existing.metricId,
                baselineValue: existing.baselineValue.toString(),
                targetValue: existing.targetValue.toString(),
                direction: existing.direction,
              },
              after: null,
            },
          });
        }

        const row = (await tx.metricKrLink.create({
          data: {
            metricId: dto.metricId,
            keyResultId,
            organizationId: orgId,
            baselineValue: baseline,
            targetValue: target,
            direction,
            createdByUserId: authContext.userId,
          },
        })) as LinkRow;

        await this.auditEmitter.emit({
          action: 'kr.metric_linked',
          entityType: 'okr.key_result',
          entityId: keyResultId,
          diff: {
            before: null,
            after: { metricId: dto.metricId, baselineValue: baseline, targetValue: target, direction },
          },
        });

        return row;
      }),
    );

    const progressBp = this.linkProgress(actual, baseline, target, hasData);
    await this.keyResultService.attachAutomaticKr(keyResultId, progressBp, authContext);

    return this.toLinkDto(created, metric.name, actual, hasData, progressBp);
  }

  /**
   * PATCH /key-results/:id/metric-link — edit snapshot baseline/target/direction
   * mid-period (RN-O9). Immediate recompute + audit. Rejects an empty patch.
   */
  async update(
    keyResultId: string,
    orgId: string,
    dto: UpdateMetricKrLinkDto,
    authContext: AuthContext,
  ): Promise<MetricKrLinkDto> {
    if (
      dto.baselineValue === undefined &&
      dto.targetValue === undefined &&
      dto.direction === undefined
    ) {
      throw new UnprocessableEntityException(
        'El patch debe incluir al menos uno de: baselineValue, targetValue, direction.',
      );
    }

    const kr = await this.loadKrWithPeriod(keyResultId, orgId);
    assertPeriodOpen(kr.period); // RN-O8

    const existing = (await this.prisma.scoped.metricKrLink.findFirst({
      where: { keyResultId, organizationId: orgId },
    })) as LinkRow | null;
    if (!existing) {
      throw new NotFoundException(`El Key Result ${keyResultId} no tiene un indicador vinculado.`);
    }
    const metric = await this.loadMetric(existing.metricId, orgId);

    const baseline = dto.baselineValue ?? existing.baselineValue.toString();
    const target = dto.targetValue ?? existing.targetValue.toString();
    const direction = (dto.direction ?? existing.direction) as MetricDirection;
    this.assertBaselineTargetDiffer(baseline, target); // §3

    const { actual, hasData } = await this.currentCumulative(existing.metricId, orgId);

    const updated = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const row = (await tx.metricKrLink.update({
          where: { id: existing.id },
          data: { baselineValue: baseline, targetValue: target, direction },
        })) as LinkRow;

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.baselineValue !== undefined) {
          before['baselineValue'] = existing.baselineValue.toString();
          after['baselineValue'] = baseline;
        }
        if (dto.targetValue !== undefined) {
          before['targetValue'] = existing.targetValue.toString();
          after['targetValue'] = target;
        }

        await this.auditEmitter.emit({
          action: 'kr.metric_link_updated',
          entityType: 'okr.key_result',
          entityId: keyResultId,
          diff: { before, after },
        });

        return row;
      }),
    );

    const progressBp = this.linkProgress(actual, baseline, target, hasData);
    await this.keyResultService.attachAutomaticKr(keyResultId, progressBp, authContext);

    return this.toLinkDto(updated, metric.name, actual, hasData, progressBp);
  }

  /**
   * DELETE /key-results/:id/metric-link — unlink (RN-O5): hard-delete the link
   * (audited with the full snapshot, D-O3); the KR keeps its last % and reverts
   * to 'manual'.
   */
  async remove(keyResultId: string, orgId: string, authContext: AuthContext): Promise<void> {
    const kr = await this.loadKrWithPeriod(keyResultId, orgId);
    assertPeriodOpen(kr.period); // RN-O8

    const existing = (await this.prisma.scoped.metricKrLink.findFirst({
      where: { keyResultId, organizationId: orgId },
    })) as LinkRow | null;
    if (!existing) {
      throw new NotFoundException(`El Key Result ${keyResultId} no tiene un indicador vinculado.`);
    }

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.metricKrLink.delete({ where: { id: existing.id } });
        await this.auditEmitter.emit({
          action: 'kr.metric_unlinked',
          entityType: 'okr.key_result',
          entityId: keyResultId,
          diff: {
            before: {
              metricId: existing.metricId,
              baselineValue: existing.baselineValue.toString(),
              targetValue: existing.targetValue.toString(),
              direction: existing.direction,
            },
            after: null,
          },
        });
      }),
    );

    await this.keyResultService.detachAutomaticKr(keyResultId, authContext);
  }

  /** GET /metrics/:id/links — links of one metric with live progress. */
  async listByMetric(metricId: string, orgId: string): Promise<MetricKrLinkDto[]> {
    const metric = await this.loadMetric(metricId, orgId);
    const { actual, hasData } = await this.currentCumulative(metricId, orgId);
    const links = (await this.prisma.scoped.metricKrLink.findMany({
      where: { metricId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    })) as LinkRow[];

    return links.map((link) => {
      const progressBp = this.linkProgress(
        actual,
        link.baselineValue.toString(),
        link.targetValue.toString(),
        hasData,
      );
      return this.toLinkDto(link, metric.name, actual, hasData, progressBp);
    });
  }

  // ── Objective context (RN-O10, visual-only) ──────────────────────────────

  /** PUT /objectives/:id/context-metrics/:metricId — idempotent add. */
  async addContext(
    objectiveId: string,
    metricId: string,
    orgId: string,
    authContext: AuthContext,
  ): Promise<void> {
    await this.loadObjective(objectiveId, orgId);
    await this.loadMetric(metricId, orgId);

    const existing = await this.prisma.scoped.metricObjectiveContext.findFirst({
      where: { metricId, objectiveId, organizationId: orgId },
    });
    if (existing) return; // idempotent

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.metricObjectiveContext.create({
          data: {
            metricId,
            objectiveId,
            organizationId: orgId,
            createdByUserId: authContext.userId,
          },
        });
        await this.auditEmitter.emit({
          action: 'metric_objective_context.linked',
          entityType: 'metrics.metric_objective_context',
          entityId: `${metricId}:${objectiveId}`,
          diff: { before: null, after: { metricId, objectiveId } },
        });
      }),
    );
  }

  /** DELETE /objectives/:id/context-metrics/:metricId — idempotent remove. */
  async removeContext(
    objectiveId: string,
    metricId: string,
    orgId: string,
    authContext: AuthContext,
  ): Promise<void> {
    const existing = await this.prisma.scoped.metricObjectiveContext.findFirst({
      where: { metricId, objectiveId, organizationId: orgId },
    });
    if (!existing) return; // idempotent

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.metricObjectiveContext.delete({
          where: { metricId_objectiveId: { metricId, objectiveId } },
        });
        await this.auditEmitter.emit({
          action: 'metric_objective_context.unlinked',
          entityType: 'metrics.metric_objective_context',
          entityId: `${metricId}:${objectiveId}`,
          diff: { before: { metricId, objectiveId }, after: null },
        });
      }),
    );
  }

  /** GET /objectives/:id/context-metrics — visual context list. */
  async listContext(objectiveId: string, orgId: string): Promise<MetricContextDto[]> {
    await this.loadObjective(objectiveId, orgId);
    const rows = (await this.prisma.scoped.metricObjectiveContext.findMany({
      where: { objectiveId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    })) as Array<{ metricId: string; objectiveId: string; createdAt: Date }>;

    const out: MetricContextDto[] = [];
    for (const row of rows) {
      const metric = await this.loadMetric(row.metricId, orgId);
      const { actual } = await this.currentCumulative(row.metricId, orgId);
      out.push({
        metricId: row.metricId,
        metricName: metric.name,
        objectiveId: row.objectiveId,
        direction: metric.direction as MetricDirection,
        lastValue: actual,
        createdAt: row.createdAt.toISOString(),
      });
    }
    return out;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private linkProgress(
    actual: string,
    baseline: string,
    target: string,
    hasData: boolean,
  ): number {
    // RN-O6: a metric with no data drives the KR to 0% ("sin datos").
    return hasData ? computeAutomaticKrProgressBp({ actual, baseline, target }) : 0;
  }

  private toLinkDto(
    link: LinkRow,
    metricName: string,
    actual: string,
    hasData: boolean,
    progressBp: number,
  ): MetricKrLinkDto {
    return {
      id: link.id,
      metricId: link.metricId,
      metricName,
      keyResultId: link.keyResultId,
      baselineValue: link.baselineValue.toString(),
      targetValue: link.targetValue.toString(),
      direction: link.direction as MetricDirection,
      lastValue: actual,
      computedProgressBp: progressBp,
      estado: hasData ? 'ok' : 'sin-datos',
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    };
  }

  private assertBaselineTargetDiffer(baseline: string, target: string): void {
    if (parseDecimal4(baseline) === parseDecimal4(target)) {
      throw new UnprocessableEntityException(
        'baseline y target no pueden ser iguales (vínculo inválido, §3).',
      );
    }
  }

  private async currentCumulative(
    metricId: string,
    orgId: string,
  ): Promise<{ actual: string; hasData: boolean }> {
    const metric = (await this.prisma.scoped.metric.findFirst({
      where: { id: metricId, organizationId: orgId, deletedAt: null },
      select: { baselineValue: true },
    })) as { baselineValue: Decimalish } | null;
    if (!metric) {
      throw new NotFoundException(`Metric ${metricId} not found`);
    }

    const entries = (await this.prisma.scoped.metricEntry.findMany({
      where: { metricId, deletedAt: null },
      select: { incrementValue: true },
    })) as Array<{ incrementValue: Decimalish }>;

    let running = parseDecimal4(metric.baselineValue.toString());
    for (const entry of entries) {
      running += parseDecimal4(entry.incrementValue.toString());
    }
    return { actual: formatDecimal4(running), hasData: entries.length > 0 };
  }

  private async loadKrWithPeriod(keyResultId: string, orgId: string): Promise<KrWithPeriod> {
    const kr = (await this.prisma.scoped.keyResult.findFirst({
      where: { id: keyResultId, organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        objective: {
          select: {
            periodId: true,
            period: { select: { id: true, code: true, status: true } },
          },
        },
      },
    })) as {
      id: string;
      objective: {
        periodId: string;
        period: { id: string; code: string; status: string };
      };
    } | null;
    if (!kr) {
      throw new NotFoundException(`Key result ${keyResultId} not found`);
    }
    return {
      id: kr.id,
      periodId: kr.objective.periodId,
      period: {
        id: kr.objective.period.id,
        code: kr.objective.period.code,
        status: kr.objective.period.status as 'open' | 'closed' | 'future',
      },
    };
  }

  private async loadMetric(metricId: string, orgId: string): Promise<MetricRow> {
    const metric = (await this.prisma.scoped.metric.findFirst({
      where: { id: metricId, organizationId: orgId, deletedAt: null },
      select: { id: true, name: true, direction: true, periodId: true },
    })) as MetricRow | null;
    if (!metric) {
      throw new NotFoundException(`Metric ${metricId} not found`);
    }
    return metric;
  }

  private async loadObjective(objectiveId: string, orgId: string): Promise<void> {
    const objective = await this.prisma.scoped.objective.findFirst({
      where: { id: objectiveId, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }
  }
}
