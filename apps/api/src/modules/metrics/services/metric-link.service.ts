import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import type { MetricContextDto, MetricDirection } from '@gestion-publica/shared-types/metrics';
import { formatDecimal4, parseDecimal4 } from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { ORG_UNIT_SCOPE, type OrgUnitScope } from '../../../common/contracts/index.js';

type Decimalish = { toString(): string };

type MetricRow = {
  id: string;
  name: string;
  direction: string;
  periodId: string;
};

/**
 * MetricLinkService — contexto métrica ↔ objetivo (visual, RN-O10).
 * Un indicador de contexto no entra en ningún cálculo de avance. El vínculo métrica ↔ KR se eliminó en el
 * contract de la transición (F10, ADR-0009 D6): la medición del objetivo vive en `ObjectiveIndicator`.
 */
@Injectable()
export class MetricLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

  // ── Objective context (RN-O10, visual-only) ──────────────────────────────

  /** PUT /objectives/:id/context-metrics/:metricId — idempotent add. */
  async addContext(
    objectiveId: string,
    metricId: string,
    orgId: string,
    authContext: AuthContext,
  ): Promise<void> {
    const objective = await this.loadObjective(objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId); // RN-P20
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

    const objective = await this.loadObjective(objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId); // RN-P20

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

  private async loadObjective(objectiveId: string, orgId: string): Promise<{ orgUnitId: string }> {
    const objective = (await this.prisma.scoped.objective.findFirst({
      where: { id: objectiveId, organizationId: orgId, deletedAt: null },
      select: { id: true, orgUnitId: true },
    })) as { id: string; orgUnitId: string } | null;
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }
    return { orgUnitId: objective.orgUnitId };
  }
}
