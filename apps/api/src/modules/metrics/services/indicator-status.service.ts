import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ExpectedCurveMode,
  IndicatorContributionsSummaryDto,
  IndicatorStatusDto,
  MetricFrequency,
  ObjectiveStatusDto,
} from '@gestion-publica/shared-types/metrics';
import {
  DEFAULT_GRACE_DAYS,
  accumulatedValue,
  buildBuckets,
  deviationBp,
  expectedCurve,
  pendingBuckets,
  summarizeContributions,
  toUTCMidnight,
  type PeriodRange,
  type ProjectStepInput,
  type TargetPointInput,
} from '@gestion-publica/metrics-domain';
import { aggregateDeviationBp, progressDeviationBp, semaphore } from '@gestion-publica/deviation-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import {
  OBJECTIVE_LOOKUP,
  OBJECTIVE_PROGRESS_READER,
  PROJECT_LINK_READER,
  type ObjectiveLookup,
  type ObjectiveProgressReader,
  type ProjectLinkReader,
} from '../../../common/contracts/index.js';
import { toCurvePoints, toDateOnly } from './target-points.js';

type Decimalish = { toString(): string };

interface IndicatorForStatus {
  id: string;
  objectiveId: string;
  metricId: string;
  baselineValue: Decimalish;
  targetValue: Decimalish;
  weightBp: number | null;
  expectedCurveMode: string;
  linkMode: string;
}

interface MetricForStatus {
  id: string;
  periodId: string;
  frequency: string;
  baselineValue: Decimalish;
}

/**
 * Estado de indicadores y objetivos (RN-P9, RN-P15, RN-P17). Solo lectura.
 *
 * - La matemática pura vive en paquetes: curva esperada y buckets vencidos en `metrics-domain`; desvío, semáforo
 *   y agregación del desvío en `deviation-domain`; avance planificado de gestión en `okr-domain` (vía el puerto
 *   `OBJECTIVE_PROGRESS_READER`, `metrics` no importa `okr`).
 * - Desvío de RESULTADO (RN-P9): valor real acumulado contra la curva esperada en la fecha del ÚLTIMO bucket
 *   cargado. Sin cargas no hay desvío (`null`): "sin datos" no es un atraso.
 * - Las dos lecturas del objetivo viajan separadas; este service nunca las combina.
 */
@Injectable()
export class IndicatorStatusService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECTIVE_LOOKUP) private readonly objectiveLookup: ObjectiveLookup,
    @Inject(OBJECTIVE_PROGRESS_READER) private readonly progressReader: ObjectiveProgressReader,
    @Inject(PROJECT_LINK_READER) private readonly projectLinks: ProjectLinkReader,
  ) {}

  async getIndicatorStatus(id: string, orgId: string, now: Date = new Date()): Promise<IndicatorStatusDto> {
    const indicator = (await this.prisma.scoped.objectiveIndicator.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    })) as IndicatorForStatus | null;
    if (!indicator) {
      throw new NotFoundException(`ObjectiveIndicator ${id} not found`);
    }
    const [status] = await this.buildStatuses([indicator], orgId, now);
    return status as IndicatorStatusDto;
  }

  async getObjectiveStatus(objectiveId: string, orgId: string, now: Date = new Date()): Promise<ObjectiveStatusDto> {
    const objective = await this.objectiveLookup.findLiveObjective(orgId, objectiveId);
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }
    const reading = await this.progressReader.readObjectiveProgress(orgId, objectiveId, now);
    if (!reading) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }

    const indicators = (await this.prisma.scoped.objectiveIndicator.findMany({
      where: { objectiveId, organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })) as IndicatorForStatus[];
    const statuses = await this.buildStatuses(indicators, orgId, now);

    const resultDeviation = aggregateDeviationBp(
      statuses.map((s, i) => ({
        weightBp: (indicators[i] as IndicatorForStatus).weightBp,
        deviationBp: s.deviationBp,
      })),
    );
    const executionDeviation = progressDeviationBp(reading.executionProgressBp, reading.plannedExecutionProgressBp);

    return {
      objectiveId,
      asOf: now.toISOString(),
      result: {
        progressBp: reading.resultProgressBp,
        deviationBp: resultDeviation,
        semaphore: resultDeviation === null ? null : semaphore(resultDeviation),
        pendingBucketsCount: statuses.reduce((acc, s) => acc + s.pendingBuckets.length, 0),
        indicators: statuses,
      },
      execution: {
        progressBp: reading.executionProgressBp,
        plannedBp: reading.plannedExecutionProgressBp,
        deviationBp: executionDeviation,
        semaphore: semaphore(executionDeviation),
      },
    };
  }

  /** Estado de varios indicadores con las lecturas en lote (métricas, cargas, puntos y períodos). */
  private async buildStatuses(
    indicators: ReadonlyArray<IndicatorForStatus>,
    orgId: string,
    now: Date,
  ): Promise<IndicatorStatusDto[]> {
    if (indicators.length === 0) return [];
    const metricIds = [...new Set(indicators.map((i) => i.metricId))];
    const metrics = (await this.prisma.scoped.metric.findMany({
      where: { id: { in: metricIds }, organizationId: orgId },
      select: { id: true, periodId: true, frequency: true, baselineValue: true },
    })) as MetricForStatus[];
    const metricsById = new Map(metrics.map((m) => [m.id, m]));

    const periodIds = [...new Set(metrics.map((m) => m.periodId))];
    const periods = await this.prisma.scoped.period.findMany({
      where: { id: { in: periodIds }, organizationId: orgId },
      select: { id: true, startsAt: true, endsAt: true },
    });
    const periodsById = new Map(periods.map((p) => [p.id, { startsAt: p.startsAt, endsAt: p.endsAt }]));

    const entries = await this.prisma.scoped.metricEntry.findMany({
      where: { metricId: { in: metricIds }, organizationId: orgId, deletedAt: null },
      select: { metricId: true, bucketDate: true, incrementValue: true },
    });
    const points = await this.prisma.scoped.indicatorTargetPoint.findMany({
      where: { objectiveIndicatorId: { in: indicators.map((i) => i.id) }, organizationId: orgId },
      select: { objectiveIndicatorId: true, bucketDate: true, expectedValue: true },
    });

    // Aportes de proyectos (RN-P12/P17): solo de proyectos vivos. Dan los pasos de la curva `from_projects`
    // (endsAt planificado + contributionValue) y el aviso "los aportes no alcanzan la meta".
    const contributionIndicatorIds = indicators
      .filter((i) => i.linkMode === 'execution_feeds_indicator' || i.expectedCurveMode === 'from_projects')
      .map((i) => i.id);
    const contributions =
      contributionIndicatorIds.length === 0
        ? []
        : await this.prisma.scoped.projectContribution.findMany({
            where: { objectiveIndicatorId: { in: contributionIndicatorIds }, organizationId: orgId },
            select: { objectiveIndicatorId: true, projectId: true, contributionValue: true },
          });
    const liveProjects = await this.projectLinks.findLiveProjects(orgId, [
      ...new Set(contributions.map((c) => c.projectId)),
    ]);
    const projectsById = new Map(liveProjects.map((p) => [p.id, p]));

    const today = toUTCMidnight(now);
    return indicators.map((indicator) => {
      const metric = metricsById.get(indicator.metricId);
      const range = metric ? periodsById.get(metric.periodId) : undefined;
      if (!metric || !range) {
        // FK RESTRICT: un indicador vivo siempre tiene métrica y período.
        throw new NotFoundException(`Metric ${indicator.metricId} not found`);
      }
      return this.buildStatus(
        indicator,
        metric,
        range,
        entries.filter((e) => e.metricId === metric.id),
        toCurvePoints(points.filter((p) => p.objectiveIndicatorId === indicator.id)),
        contributions
          .filter((c) => c.objectiveIndicatorId === indicator.id && projectsById.has(c.projectId))
          .map((c) => ({
            endsAt: (projectsById.get(c.projectId) as { endsAt: Date }).endsAt,
            contributionValue: c.contributionValue.toString(),
          })),
        today,
      );
    });
  }

  private buildStatus(
    indicator: IndicatorForStatus,
    metric: MetricForStatus,
    range: PeriodRange,
    entries: ReadonlyArray<{ bucketDate: Date; incrementValue: Decimalish }>,
    points: ReadonlyArray<TargetPointInput>,
    steps: ReadonlyArray<ProjectStepInput>,
    today: Date,
  ): IndicatorStatusDto {
    const baseline = indicator.baselineValue.toString();
    const target = indicator.targetValue.toString();
    const mode = indicator.expectedCurveMode as ExpectedCurveMode;

    const expectedAt = (at: Date): string =>
      mode === 'manual'
        ? expectedCurve({ mode, at, range, baseline, target, points })
        : mode === 'from_projects'
          ? expectedCurve({ mode, at, range, baseline, target, steps })
          : expectedCurve({ mode, at, range, baseline, target });

    const actualValue = accumulatedValue(
      metric.baselineValue.toString(),
      entries.map((e) => e.incrementValue.toString()),
    );
    const hasData = entries.length > 0;
    const asOfDate = hasData
      ? new Date(Math.max(...entries.map((e) => toUTCMidnight(e.bucketDate).getTime())))
      : null;

    const expectedValue = asOfDate ? expectedAt(asOfDate) : null;
    const deviation =
      expectedValue === null ? null : deviationBp({ actual: actualValue, expected: expectedValue, baseline, target });

    const pending = pendingBuckets(
      entries.map((e) => ({ bucketDate: e.bucketDate })),
      buildBuckets(range, metric.frequency as MetricFrequency),
      today,
      DEFAULT_GRACE_DAYS,
      range.endsAt,
    );

    // Aviso de aportes que no alcanzan la meta (C18): solo con vínculo `execution_feeds_indicator`.
    const contributionsSummary: IndicatorContributionsSummaryDto | null =
      indicator.linkMode === 'execution_feeds_indicator'
        ? summarizeContributions({ baseline, target, contributionValues: steps.map((st) => st.contributionValue) })
        : null;

    return {
      objectiveIndicatorId: indicator.id,
      objectiveId: indicator.objectiveId,
      expectedCurveMode: mode,
      hasData,
      asOf: asOfDate ? toDateOnly(asOfDate) : null,
      actualValue,
      expectedValue,
      expectedToday: expectedAt(today),
      deviationBp: deviation,
      semaphore: deviation === null ? null : semaphore(deviation),
      pendingBuckets: pending.map(toDateOnly),
      graceDays: DEFAULT_GRACE_DAYS,
      contributions: contributionsSummary,
    };
  }
}
