import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  computeAutomaticKrProgressBp,
  formatDecimal4,
  parseDecimal4,
} from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { KeyResultService } from '../../okr/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

type LinkRow = {
  keyResultId: string;
  baselineValue: { toString(): string };
  targetValue: { toString(): string };
};

/**
 * MetricLinkService — Módulo 2 "Indicadores en OKRs".
 *
 * Owns the metric↔KR link and, crucially, the recompute hook: whenever a
 * MetricEntry mutation commits, every automatic KR linked to that metric is
 * recomputed from the metric's current accumulated value and pushed into the
 * OKR cascade via KeyResultService.applyAutomaticKrProgress (D-O1, D-O5).
 *
 * Per docs/features/indicadores-okr.md.
 */
@Injectable()
export class MetricLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyResultService: KeyResultService,
    // Reserved for the link CRUD endpoints (PASO 5); already wired so the
    // service is self-contained.
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  /**
   * Recompute all automatic KRs linked to `metricId` from the metric's current
   * accumulated value (baseline + Σ active increments). No-op when the metric
   * has no links. Applies RN-O6: a metric with zero data drives the KR to 0%.
   *
   * ALS-aware: the tenant-scoped reads run inside tenantContextStorage.run;
   * each applyAutomaticKrProgress call re-enters its own context + transaction.
   * Intended to be called AFTER the MetricEntry transaction has committed.
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
      })) as LinkRow[];
      if (links.length === 0) {
        return { links, actual: '0', hasData: false };
      }
      const cumulative = await this.currentCumulative(metricId, orgId);
      return { links, ...cumulative };
    });

    for (const link of snapshot.links) {
      const progressBp = snapshot.hasData
        ? computeAutomaticKrProgressBp({
            actual: snapshot.actual,
            baseline: link.baselineValue.toString(),
            target: link.targetValue.toString(),
          })
        : 0; // RN-O6: indicador sin datos → KR 0% "sin datos".
      await this.keyResultService.applyAutomaticKrProgress(
        link.keyResultId,
        progressBp,
        authContext,
      );
    }
  }

  /**
   * Metric's current accumulated value = baseline + Σ active increments, and
   * whether it has any data at all. Must run inside an ALS tenant context.
   */
  private async currentCumulative(
    metricId: string,
    orgId: string,
  ): Promise<{ actual: string; hasData: boolean }> {
    const metric = (await this.prisma.scoped.metric.findFirst({
      where: { id: metricId, organizationId: orgId, deletedAt: null },
      select: { baselineValue: true },
    })) as { baselineValue: { toString(): string } } | null;
    if (!metric) {
      throw new NotFoundException(`Metric ${metricId} not found`);
    }

    const entries = (await this.prisma.scoped.metricEntry.findMany({
      where: { metricId, deletedAt: null },
      select: { incrementValue: true },
    })) as Array<{ incrementValue: { toString(): string } }>;

    let running = parseDecimal4(metric.baselineValue.toString());
    for (const entry of entries) {
      running += parseDecimal4(entry.incrementValue.toString());
    }
    return { actual: formatDecimal4(running), hasData: entries.length > 0 };
  }
}
