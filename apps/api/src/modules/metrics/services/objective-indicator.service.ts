import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  MetricDirection,
  MetricFrequency,
  MetricKind,
  MetricUnit,
  ObjectiveIndicatorDto,
  ObjectiveIndicatorLinkMode,
  ExpectedCurveMode,
  IndicatorProgressChangedEvent,
  IndicatorTargetPointDto,
  LinkedProjectRefDto,
} from '@gestion-publica/shared-types/metrics';
import { INDICATOR_PROGRESS_CHANGED } from '@gestion-publica/shared-types/metrics';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { computeResultProgress, projectSumAfterDelete, weightMode } from '@gestion-publica/okr-domain';
import {
  accumulatedValue,
  objectiveIndicatorProgressBp,
  parseDecimal4,
  type PeriodRange,
} from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService, requestContextStorage, type PrismaTransactionClient } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import {
  OBJECTIVE_LOOKUP,
  ORG_UNIT_SCOPE,
  PROJECT_LINK_READER,
  type ObjectiveLookup,
  type OrgUnitScope,
  type ObjectiveRef,
  type ProjectLinkReader,
} from '../../../common/contracts/index.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import { assertSameSiblingSet, assertValidWeightGroup } from '../../../common/weights/weight-group.js';
import type { CreateObjectiveIndicatorDto } from '../dto/create-objective-indicator.dto.js';
import type { UpdateObjectiveIndicatorDto } from '../dto/update-objective-indicator.dto.js';
import type { SetObjectiveIndicatorWeightsDto } from '../dto/set-objective-indicator-weights.dto.js';
import type { SetIndicatorTargetPointsDto } from '../dto/indicator-target-point.dto.js';
import { MetricService } from './metric.service.js';
import { sameTargetPoints, toDateOnly, validateTargetPoints, type ValidTargetPoint } from './target-points.js';

type Decimalish = { toString(): string };

type IndicatorRow = {
  id: string;
  organizationId: string;
  objectiveId: string;
  metricId: string;
  baselineValue: Decimalish;
  targetValue: Decimalish;
  direction: string;
  weightBp: number | null;
  expectedCurveMode: string;
  linkMode: string;
  progressCachedBp: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MetricRef = {
  id: string;
  name: string;
  periodId: string;
  unit: string;
  direction: string;
  frequency: string;
  kind: string;
  baselineValue: Decimalish;
  targetValue: Decimalish;
};

const METRIC_REF_SELECT = {
  id: true,
  name: true,
  periodId: true,
  unit: true,
  direction: true,
  frequency: true,
  kind: true,
  baselineValue: true,
  targetValue: true,
} as const;

/**
 * ABM de ObjectiveIndicator (N4, ADR-0009 D2/D5/D8) y avance de RESULTADO (RN-P8).
 *
 * - Base, meta y dirección mandan en el indicador (D8); la métrica solo aporta la serie de cargas.
 *   El valor ACTUAL es siempre el acumulado de la métrica (base de la métrica + Σ incrementos), no el del
 *   indicador: la base del indicador solo entra en la interpolación (confirmado por Pedro).
 * - Pesos todo-o-nada entre indicadores hermanos del objetivo (RN-P6), con `okr-domain`.
 * - `okr` no se importa: el objetivo se lee por el puerto `OBJECTIVE_LOOKUP` (validación sincrónica).
 * - Dentro de su propia transacción `metrics` recalcula `progressCachedBp` de sus indicadores y el resultado
 *   agregado del objetivo (`computeResultProgress`). DESPUÉS del commit emite `indicator.progress_changed`
 *   (ADR-0009 D5); `okr` lo escucha y actualiza `Objective.resultProgressCachedBp` (consistencia eventual).
 * - El avance del indicador (matemática pura) vive en `metrics-domain`. Nunca se combina con la gestión.
 */
@Injectable()
export class ObjectiveIndicatorService {
  private readonly logger = new Logger(ObjectiveIndicatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly metricService: MetricService,
    @Inject(OBJECTIVE_LOOKUP) private readonly objectiveLookup: ObjectiveLookup,
    private readonly eventEmitter: EventEmitter2,
    @Inject(PROJECT_LINK_READER) private readonly projectLinks: ProjectLinkReader,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

  async listByObjective(objectiveId: string, orgId: string): Promise<ObjectiveIndicatorDto[]> {
    await this.findObjectiveOrThrow(objectiveId, orgId);
    const rows = (await this.prisma.scoped.objectiveIndicator.findMany({
      where: { objectiveId, organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })) as IndicatorRow[];
    return this.toDtos(rows, orgId);
  }

  async getById(id: string, orgId: string): Promise<ObjectiveIndicatorDto> {
    const row = await this.findIndicatorOrThrow(id, orgId);
    const [dto] = await this.toDtos([row], orgId);
    return dto as ObjectiveIndicatorDto;
  }

  async create(
    objectiveId: string,
    orgId: string,
    dto: CreateObjectiveIndicatorDto,
    authContext: AuthContext,
  ): Promise<ObjectiveIndicatorDto> {
    const objective = await this.findObjectiveOrThrow(objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    assertPeriodOpen(objective.period);

    if ((dto.metricId === undefined) === (dto.metric === undefined)) {
      throw new UnprocessableEntityException(
        'IndicatorMetricSourceInvalid: indicá exactamente una de las dos opciones: una métrica existente (metricId) o los datos de una métrica nueva (metric).',
      );
    }

    // Métrica existente: del mismo período del objetivo (ADR-0009 D2) y sin duplicar el par (objetivo, métrica).
    let existingMetric: MetricRef | null = null;
    if (dto.metricId !== undefined) {
      existingMetric = await this.findMetricOrThrow(dto.metricId, orgId);
      if (existingMetric.periodId !== objective.periodId) {
        throw new UnprocessableEntityException(
          `IndicatorPeriodMismatch: la métrica "${existingMetric.name}" y el objetivo deben pertenecer al mismo período (ADR-0009).`,
        );
      }
      // C20b #2: vincular aporta el objetivo al conjunto de quienes miden la métrica y cambia quién puede cargarla.
      // Además de la unidad del objetivo, el actor debe poder escribir la métrica hoy (central si no tiene
      // objetivos vivos; todas las unidades que la miden si los tiene).
      await this.metricService.assertCanWriteMetric(existingMetric.id, orgId, authContext);
      await this.assertPairAvailable(objectiveId, existingMetric.id, orgId);
    }

    const kind: MetricKind = existingMetric ? (existingMetric.kind as MetricKind) : (dto.metric?.kind as MetricKind);
    const baselineValue = dto.baselineValue ?? existingMetric?.baselineValue.toString() ?? '0';
    const targetValue = dto.targetValue ?? existingMetric?.targetValue.toString();
    const direction = dto.direction ?? (existingMetric?.direction as MetricDirection | undefined);
    if (targetValue === undefined || direction === undefined) {
      throw new UnprocessableEntityException(
        'IndicatorTargetRequired: con una métrica nueva, targetValue y direction son obligatorios.',
      );
    }
    const linkMode: ObjectiveIndicatorLinkMode = dto.linkMode ?? 'independent';
    this.assertBaselineTargetDiffer(baselineValue, targetValue);
    this.assertDirectionMatchesTarget(direction, baselineValue, targetValue);
    this.assertLinkModeAllowedForKind(linkMode, kind);
    const weightBp = dto.weightBp ?? null;

    // RN-P17: curva esperada. `manual` necesita puntos válidos en el mismo pedido.
    const expectedCurveMode: ExpectedCurveMode = dto.expectedCurveMode ?? 'linear';
    this.assertCurveModeAvailable(expectedCurveMode, kind, linkMode);
    let targetPoints: ValidTargetPoint[] = [];
    if (dto.targetPoints !== undefined && dto.targetPoints.length > 0) {
      targetPoints = validateTargetPoints(dto.targetPoints, {
        range: await this.findPeriodRange(objective.periodId, orgId),
        frequency: (existingMetric?.frequency ?? dto.metric?.frequency) as MetricFrequency,
        target: targetValue,
      });
    }
    if (expectedCurveMode === 'manual' && targetPoints.length === 0) {
      throw this.manualNeedsPoints();
    }

    const { dto: created, events } = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await this.lockGroup(tx, objectiveId);
        const siblings = await tx.objectiveIndicator.findMany({
          where: { objectiveId, organizationId: orgId, deletedAt: null },
          select: { weightBp: true },
        });
        assertValidWeightGroup([...siblings, { weightBp }], 'indicadores');

        let metricId: string;
        let metricBaseline: string;
        let increments: string[] = [];
        if (existingMetric) {
          metricId = existingMetric.id;
          metricBaseline = existingMetric.baselineValue.toString();
          increments = await this.loadIncrements(tx, metricId, orgId);
        } else {
          const inline = dto.metric as NonNullable<CreateObjectiveIndicatorDto['metric']>;
          // D8: la métrica nueva toma base, meta y dirección del indicador como valores iniciales.
          const metric = await this.metricService.insertMetric(tx, orgId, objective.periodId, {
            name: inline.name,
            unit: inline.unit,
            frequency: inline.frequency,
            kind: inline.kind,
            source: inline.source ?? null,
            description: inline.description ?? null,
            direction,
            baselineValue,
            targetValue,
          });
          metricId = metric.id;
          metricBaseline = metric.baselineValue.toString();
        }

        const row = (await tx.objectiveIndicator.create({
          data: {
            organizationId: orgId,
            objectiveId,
            metricId,
            baselineValue,
            targetValue,
            direction,
            weightBp,
            linkMode,
            expectedCurveMode,
            progressCachedBp: objectiveIndicatorProgressBp({
              metricBaseline,
              increments,
              baseline: baselineValue,
              target: targetValue,
            }),
          },
        })) as IndicatorRow;

        await this.auditEmitter.emit({
          action: 'objective_indicator.created',
          entityType: 'metrics.objective_indicator',
          entityId: row.id,
          diff: {
            before: null,
            after: {
              objectiveId,
              metricId,
              baselineValue: row.baselineValue.toString(),
              targetValue: row.targetValue.toString(),
              direction: row.direction as MetricDirection,
              weightBp: row.weightBp,
              linkMode: row.linkMode as ObjectiveIndicatorLinkMode,
              expectedCurveMode: row.expectedCurveMode as ExpectedCurveMode,
            },
          },
        });
        if (targetPoints.length > 0) await this.replacePoints(tx, orgId, row.id, targetPoints);

        const resultBp = await this.aggregateResult(tx, orgId, objectiveId);
        return {
          dto: await this.toTxDto(tx, row, orgId),
          events: [this.buildEvent(authContext, orgId, row, resultBp)],
        };
      }),
    );
    await this.publishProgressChanged(events);
    return created;
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateObjectiveIndicatorDto,
    authContext: AuthContext,
  ): Promise<ObjectiveIndicatorDto> {
    const existing = await this.findIndicatorOrThrow(id, orgId);
    const objective = await this.findObjectiveOrThrow(existing.objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    assertPeriodOpen(objective.period);
    const metric = await this.findMetricOrThrow(existing.metricId, orgId);

    const baselineValue = dto.baselineValue ?? existing.baselineValue.toString();
    const targetValue = dto.targetValue ?? existing.targetValue.toString();
    const direction = dto.direction ?? (existing.direction as MetricDirection);
    const linkMode = dto.linkMode ?? (existing.linkMode as ObjectiveIndicatorLinkMode);
    this.assertBaselineTargetDiffer(baselineValue, targetValue);
    this.assertDirectionMatchesTarget(direction, baselineValue, targetValue);
    if (dto.linkMode !== undefined && dto.linkMode !== existing.linkMode) {
      this.assertLinkModeAllowedForKind(linkMode, metric.kind as MetricKind);
    }
    const weightBp = dto.weightBp !== undefined ? dto.weightBp : existing.weightBp;

    // RN-P17: curva esperada. Si queda en `manual`, los puntos (nuevos o los guardados) deben ser válidos
    // contra la meta resultante (el último punto == meta).
    const expectedCurveMode = dto.expectedCurveMode ?? (existing.expectedCurveMode as ExpectedCurveMode);
    // `from_projects` se valida siempre con el tipo y el vínculo RESULTANTES: cambiar el vínculo de un indicador que
    // está en `from_projects` también lo rompería.
    this.assertCurveModeAvailable(expectedCurveMode, metric.kind as MetricKind, linkMode);
    const rawPoints: Array<{ bucketDate: string; expectedValue: string }> =
      dto.targetPoints ?? (expectedCurveMode === 'manual' ? await this.loadStoredPointsRaw(id, orgId) : []);
    const targetPoints =
      rawPoints.length > 0
        ? validateTargetPoints(rawPoints, {
            range: await this.findPeriodRange(metric.periodId, orgId),
            frequency: metric.frequency as MetricFrequency,
            target: targetValue,
          })
        : [];
    if (expectedCurveMode === 'manual' && targetPoints.length === 0) {
      throw this.manualNeedsPoints();
    }

    const { dto: updated, events } = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await this.lockGroup(tx, existing.objectiveId);

        // ADR-0009 D5 regla 3: no se cambia el vínculo con proyectos vinculados vigentes.
        if (linkMode !== existing.linkMode) {
          await this.assertNoLinkedProjects(tx, orgId, id, 'cambiar el vínculo con la gestión');
        }

        if (dto.weightBp !== undefined && dto.weightBp !== existing.weightBp) {
          const siblings = await tx.objectiveIndicator.findMany({
            where: { objectiveId: existing.objectiveId, organizationId: orgId, deletedAt: null, id: { not: id } },
            select: { weightBp: true },
          });
          assertValidWeightGroup([...siblings, { weightBp }], 'indicadores');
        }

        const increments = await this.loadIncrements(tx, existing.metricId, orgId);
        const progressCachedBp = objectiveIndicatorProgressBp({
          metricBaseline: metric.baselineValue.toString(),
          increments,
          baseline: baselineValue,
          target: targetValue,
        });

        const row = (await tx.objectiveIndicator.update({
          where: { id },
          data: { baselineValue, targetValue, direction, weightBp, linkMode, expectedCurveMode, progressCachedBp },
        })) as IndicatorRow;

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        const track = (key: string, prev: unknown, next: unknown): void => {
          if (prev !== next) {
            before[key] = prev;
            after[key] = next;
          }
        };
        track('baselineValue', existing.baselineValue.toString(), row.baselineValue.toString());
        track('targetValue', existing.targetValue.toString(), row.targetValue.toString());
        track('direction', existing.direction, row.direction);
        track('weightBp', existing.weightBp, row.weightBp);
        track('linkMode', existing.linkMode, row.linkMode);
        track('expectedCurveMode', existing.expectedCurveMode, row.expectedCurveMode);
        if (Object.keys(after).length > 0) {
          await this.auditEmitter.emit({
            action: 'objective_indicator.updated',
            entityType: 'metrics.objective_indicator',
            entityId: id,
            diff: { before, after },
          });
        }
        if (dto.targetPoints !== undefined) {
          await this.replacePoints(tx, orgId, id, targetPoints);
        }

        const resultBp = await this.aggregateResult(tx, orgId, existing.objectiveId);
        return {
          dto: await this.toTxDto(tx, row, orgId),
          events: [this.buildEvent(authContext, orgId, row, resultBp)],
        };
      }),
    );
    await this.publishProgressChanged(events);
    return updated;
  }

  /** Puntos de la curva esperada manual (RN-P17), ordenados por fecha. */
  async getTargetPoints(id: string, orgId: string): Promise<IndicatorTargetPointDto[]> {
    await this.findIndicatorOrThrow(id, orgId);
    const rows = await this.prisma.scoped.indicatorTargetPoint.findMany({
      where: { objectiveIndicatorId: id, organizationId: orgId },
      orderBy: { bucketDate: 'asc' },
    });
    return rows.map((r) => ({ bucketDate: toDateOnly(r.bucketDate), expectedValue: r.expectedValue.toString() }));
  }

  /**
   * Reemplazo atómico de los puntos de la curva manual (RN-P17). Se validan contra la meta VIGENTE del indicador
   * (el último punto == meta) y las fechas contra los buckets de su métrica. No cambia el modo de curva (eso es el
   * PATCH), pero no se puede vaciar la lista de un indicador que está en modo `manual`. Lista vacía = borrar.
   */
  async setTargetPoints(
    id: string,
    orgId: string,
    dto: SetIndicatorTargetPointsDto,
    authContext: AuthContext,
  ): Promise<IndicatorTargetPointDto[]> {
    const existing = await this.findIndicatorOrThrow(id, orgId);
    const objective = await this.findObjectiveOrThrow(existing.objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    assertPeriodOpen(objective.period);
    const metric = await this.findMetricOrThrow(existing.metricId, orgId);

    const points =
      dto.points.length > 0
        ? validateTargetPoints(dto.points, {
            range: await this.findPeriodRange(metric.periodId, orgId),
            frequency: metric.frequency as MetricFrequency,
            target: existing.targetValue.toString(),
          })
        : [];
    if (existing.expectedCurveMode === 'manual' && points.length === 0) {
      throw this.manualNeedsPoints();
    }

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await this.lockGroup(tx, existing.objectiveId);
        await this.replacePoints(tx, orgId, id, points);
      }),
    );
    return points.map((p) => ({ bucketDate: toDateOnly(p.bucketDate), expectedValue: p.expectedValue }));
  }

  /** Reemplazo atómico de los pesos de todo el grupo (RN-P6/P7): todos con peso y suma 10000, o todos `null`. */
  async setWeights(
    objectiveId: string,
    orgId: string,
    dto: SetObjectiveIndicatorWeightsDto,
    authContext: AuthContext,
  ): Promise<ObjectiveIndicatorDto[]> {
    const objective = await this.findObjectiveOrThrow(objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    assertPeriodOpen(objective.period);

    const { items, events } = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await this.lockGroup(tx, objectiveId);
        const live = (await tx.objectiveIndicator.findMany({
          where: { objectiveId, organizationId: orgId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        })) as IndicatorRow[];
        assertSameSiblingSet(
          live.map((i) => i.id),
          dto.weights.map((w) => w.id),
        );
        assertValidWeightGroup(dto.weights, 'indicadores');

        const result: IndicatorRow[] = [];
        const changed: IndicatorRow[] = [];
        for (const indicator of live) {
          const requested = dto.weights.find((w) => w.id === indicator.id)?.weightBp ?? null;
          if (requested === indicator.weightBp) {
            result.push(indicator);
            continue;
          }
          const updated = (await tx.objectiveIndicator.update({
            where: { id: indicator.id },
            data: { weightBp: requested },
          })) as IndicatorRow;
          await this.auditEmitter.emit({
            action: 'objective_indicator.updated',
            entityType: 'metrics.objective_indicator',
            entityId: indicator.id,
            diff: { before: { weightBp: indicator.weightBp }, after: { weightBp: requested } },
          });
          result.push(updated);
          changed.push(updated);
        }

        const resultBp = await this.aggregateResult(tx, orgId, objectiveId);
        return {
          items: await this.toTxDtos(tx, result, orgId),
          events: changed.map((row) => this.buildEvent(authContext, orgId, row, resultBp)),
        };
      }),
    );
    await this.publishProgressChanged(events);
    return items;
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.findIndicatorOrThrow(id, orgId);
    const objective = await this.findObjectiveOrThrow(existing.objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    assertPeriodOpen(objective.period);

    const events = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await this.lockGroup(tx, existing.objectiveId);

        // ADR-0009 D5 regla 3: un indicador con proyectos vinculados vigentes no se borra.
        await this.assertNoLinkedProjects(tx, orgId, id, 'borrar el indicador');

        // RN-P6: no se puede dejar un grupo ponderado con suma != 10000.
        const siblings = await tx.objectiveIndicator.findMany({
          where: { objectiveId: existing.objectiveId, organizationId: orgId, deletedAt: null },
          select: { id: true, weightBp: true },
        });
        if (weightMode(siblings) === 'weighted' && siblings.length > 1) {
          const remaining = projectSumAfterDelete(siblings, id);
          if (remaining !== 10000) {
            throw new UnprocessableEntityException(
              `WeightSumInvalid: borrar este indicador dejaría los pesos de los indicadores en ${remaining} bp (deben sumar 10000). Redistribuí los pesos primero (RN-P6).`,
            );
          }
        }

        const deletedAt = new Date();
        await tx.objectiveIndicator.update({ where: { id }, data: { deletedAt } });
        await this.auditEmitter.emit({
          action: 'objective_indicator.deleted',
          entityType: 'metrics.objective_indicator',
          entityId: id,
          diff: { before: { deletedAt: null }, after: { deletedAt: deletedAt.toISOString() } },
        });
        const resultBp = await this.aggregateResult(tx, orgId, existing.objectiveId);
        return [this.buildEvent(authContext, orgId, existing, resultBp)];
      }),
    );
    await this.publishProgressChanged(events);
  }

  /**
   * Hook de cargas (RN-P8): recalcula `progressCachedBp` de cada ObjectiveIndicator vivo de la métrica con SU
   * base/meta (ADR-0009 D8) y el resultado agregado de cada objetivo afectado. Se llama dentro de la transacción de
   * la carga (alta, edición o borrado del `MetricEntry`), mismo patrón que `project-recompute.ts`. Devuelve los
   * eventos `indicator.progress_changed` PENDIENTES: el llamador los publica con `publishProgressChanged` recién
   * cuando la transacción hizo commit (nunca adentro). No toca la lectura de gestión. Sin indicadores vinculados
   * es un no-op. Los grupos se bloquean en orden de objectiveId para evitar deadlocks entre cargas concurrentes.
   */
  async recomputeForMetric(
    tx: PrismaTransactionClient,
    metricId: string,
    orgId: string,
    actor: Pick<AuthContext, 'userId' | 'requestId'>,
  ): Promise<IndicatorProgressChangedEvent[]> {
    const indicators = (await tx.objectiveIndicator.findMany({
      where: { metricId, organizationId: orgId, deletedAt: null },
      select: { id: true, objectiveId: true, baselineValue: true, targetValue: true, progressCachedBp: true },
    })) as Array<Pick<IndicatorRow, 'id' | 'objectiveId' | 'baselineValue' | 'targetValue' | 'progressCachedBp'>>;
    if (indicators.length === 0) return [];

    const metric = await tx.metric.findFirstOrThrow({
      where: { id: metricId, organizationId: orgId },
      select: { baselineValue: true },
    });
    const increments = await this.loadIncrements(tx, metricId, orgId);
    const objectiveIds = [...new Set(indicators.map((i) => i.objectiveId))].sort();

    for (const objectiveId of objectiveIds) {
      await this.lockGroup(tx, objectiveId);
    }
    const updated: Array<{ id: string; objectiveId: string; progressCachedBp: number }> = [];
    for (const indicator of indicators) {
      const progressCachedBp = objectiveIndicatorProgressBp({
        metricBaseline: metric.baselineValue.toString(),
        increments,
        baseline: indicator.baselineValue.toString(),
        target: indicator.targetValue.toString(),
      });
      if (progressCachedBp !== indicator.progressCachedBp) {
        await tx.objectiveIndicator.update({ where: { id: indicator.id }, data: { progressCachedBp } });
      }
      updated.push({ id: indicator.id, objectiveId: indicator.objectiveId, progressCachedBp });
    }
    const resultByObjective = new Map<string, number>();
    for (const objectiveId of objectiveIds) {
      resultByObjective.set(objectiveId, await this.aggregateResult(tx, orgId, objectiveId));
    }
    return updated.map((row) =>
      this.buildEvent(actor, orgId, row, resultByObjective.get(row.objectiveId) as number),
    );
  }

  /**
   * Publica los eventos pendientes. Llamar SOLO después del commit. `emitAsync` espera al oyente de `okr`; si
   * falla, la escritura de `metrics` ya está confirmada: se loguea (no se revierte) y el caché del objetivo
   * queda desfasado hasta el próximo cambio del grupo.
   */
  async publishProgressChanged(events: ReadonlyArray<IndicatorProgressChangedEvent>): Promise<void> {
    for (const event of events) {
      try {
        await this.eventEmitter.emitAsync(INDICATOR_PROGRESS_CHANGED, event);
      } catch (error) {
        this.logger.error(
          `El oyente de ${INDICATOR_PROGRESS_CHANGED} falló para el objetivo ${event.objectiveId}: ${String(error)}`,
        );
      }
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Serializa las mutaciones del grupo de indicadores de un objetivo (alta, baja, pesos, cargas) con un lock
   * advisory de la transacción, sobre un recurso propio de `metrics` (no se toca la fila de `okr.objective`).
   */
  private async lockGroup(tx: PrismaTransactionClient, objectiveId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${objectiveId}))`;
  }

  /** Resultado agregado del objetivo (RN-P8): promedio simple o ponderado de sus indicadores vivos, vía `okr-domain`. */
  private async aggregateResult(tx: PrismaTransactionClient, orgId: string, objectiveId: string): Promise<number> {
    const live = await tx.objectiveIndicator.findMany({
      where: { objectiveId, organizationId: orgId, deletedAt: null },
      select: { weightBp: true, progressCachedBp: true },
    });
    return computeResultProgress(live.map((i) => ({ weightBp: i.weightBp, progressBp: i.progressCachedBp })));
  }

  private buildEvent(
    actor: Pick<AuthContext, 'userId' | 'requestId'>,
    orgId: string,
    indicator: { id: string; objectiveId: string; progressCachedBp: number },
    objectiveResultProgressBp: number,
  ): IndicatorProgressChangedEvent {
    return {
      organizationId: orgId,
      actorId: actor.userId,
      // El request real (interceptor) manda; el del AuthContext es el respaldo.
      requestId: requestContextStorage.getStore()?.requestId ?? actor.requestId,
      objectiveIndicatorId: indicator.id,
      objectiveId: indicator.objectiveId,
      progressBp: indicator.progressCachedBp,
      objectiveResultProgressBp,
    };
  }

  private async findObjectiveOrThrow(objectiveId: string, orgId: string): Promise<ObjectiveRef> {
    const objective = await this.objectiveLookup.findLiveObjective(orgId, objectiveId);
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }
    return objective;
  }

  /**
   * Reemplaza los puntos del indicador dentro de la transacción. No-op (y sin audit) si no cambian. Audita
   * `indicator_target_points.replaced` con la lista completa antes/después.
   */
  private async replacePoints(
    tx: PrismaTransactionClient,
    orgId: string,
    indicatorId: string,
    points: ReadonlyArray<ValidTargetPoint>,
  ): Promise<void> {
    const stored = await tx.indicatorTargetPoint.findMany({
      where: { objectiveIndicatorId: indicatorId, organizationId: orgId },
      orderBy: { bucketDate: 'asc' },
    });
    const before = stored.map((r) => ({ bucketDate: r.bucketDate, expectedValue: r.expectedValue.toString() }));
    if (sameTargetPoints(before, points)) return;

    await tx.indicatorTargetPoint.deleteMany({ where: { objectiveIndicatorId: indicatorId, organizationId: orgId } });
    if (points.length > 0) {
      await tx.indicatorTargetPoint.createMany({
        data: points.map((p) => ({
          organizationId: orgId,
          objectiveIndicatorId: indicatorId,
          bucketDate: p.bucketDate,
          expectedValue: p.expectedValue,
        })),
      });
    }
    const snapshot = (list: ReadonlyArray<{ bucketDate: Date; expectedValue: string }>) =>
      list.map((p) => ({ bucketDate: toDateOnly(p.bucketDate), expectedValue: p.expectedValue }));
    await this.auditEmitter.emit({
      action: 'indicator_target_points.replaced',
      entityType: 'metrics.objective_indicator',
      entityId: indicatorId,
      diff: { before: { points: snapshot(before) }, after: { points: snapshot(points) } },
    });
  }

  private async loadStoredPointsRaw(
    indicatorId: string,
    orgId: string,
  ): Promise<Array<{ bucketDate: string; expectedValue: string }>> {
    const rows = await this.prisma.scoped.indicatorTargetPoint.findMany({
      where: { objectiveIndicatorId: indicatorId, organizationId: orgId },
      orderBy: { bucketDate: 'asc' },
    });
    return rows.map((r) => ({ bucketDate: toDateOnly(r.bucketDate), expectedValue: r.expectedValue.toString() }));
  }

  private async findPeriodRange(periodId: string, orgId: string): Promise<PeriodRange> {
    const period = await this.prisma.scoped.period.findFirst({
      where: { id: periodId, organizationId: orgId },
      select: { startsAt: true, endsAt: true },
    });
    if (!period) {
      throw new NotFoundException(`Period ${periodId} not found`);
    }
    return { startsAt: period.startsAt, endsAt: period.endsAt };
  }

  /**
   * RN-P17: `from_projects` es la curva escalonada de los aportes de proyectos (`ProjectContribution`). Solo para
   * indicadores `output` con vínculo `execution_feeds_indicator`; en cualquier otro caso se rechaza con 422.
   */
  private assertCurveModeAvailable(
    mode: ExpectedCurveMode,
    kind: MetricKind,
    linkMode: ObjectiveIndicatorLinkMode,
  ): void {
    if (mode === 'from_projects' && (kind !== 'output' || linkMode !== 'execution_feeds_indicator')) {
      throw new UnprocessableEntityException(
        'ExpectedCurveModeNotAvailable: la curva "from_projects" solo existe para indicadores de producto (kind = output) con el vínculo "execution_feeds_indicator" (RN-P17). Usá "linear" o "manual".',
      );
    }
  }

  /**
   * ADR-0009 D5 regla 3: proyectos vivos vinculados al indicador, ya sea porque aportan a él (`ProjectContribution`)
   * o porque toman su avance de él (`from_indicator`). Contribuciones propias de `metrics`; el título y la vida del
   * proyecto se leen por el puerto `PROJECT_LINK_READER`.
   */
  private async findLinkedProjects(
    tx: PrismaTransactionClient,
    orgId: string,
    indicatorId: string,
  ): Promise<LinkedProjectRefDto[]> {
    const contributions = await tx.projectContribution.findMany({
      where: { objectiveIndicatorId: indicatorId, organizationId: orgId },
      select: { projectId: true },
    });
    const contributing = await this.projectLinks.findLiveProjects(orgId, contributions.map((c) => c.projectId));
    const sourced = await this.projectLinks.findLiveProjectsBySourceIndicator(orgId, indicatorId);
    return [
      ...contributing.map((p) => ({ id: p.id, title: p.title, link: 'contribution' as const })),
      ...sourced.map((p) => ({ id: p.id, title: p.title, link: 'source_indicator' as const })),
    ];
  }

  private async assertNoLinkedProjects(
    tx: PrismaTransactionClient,
    orgId: string,
    indicatorId: string,
    action: string,
  ): Promise<void> {
    const projects = await this.findLinkedProjects(tx, orgId, indicatorId);
    if (projects.length > 0) {
      throw new UnprocessableEntityException({
        message: `IndicatorHasLinkedProjects: no se puede ${action} mientras tenga proyectos vinculados vigentes (${projects
          .map((p) => `"${p.title}"`)
          .join(', ')}). Desvinculalos primero (ADR-0009 D5).`,
        // El filtro global lo expone como `details.projects` (ErrorResponseDto.details).
        details: { projects },
      });
    }
  }

  private manualNeedsPoints(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      'IndicatorTargetPointsInvalid: la curva "manual" necesita al menos un punto, y el último debe ser igual a la meta (RN-P17).',
    );
  }

  private async findIndicatorOrThrow(id: string, orgId: string): Promise<IndicatorRow> {
    const row = (await this.prisma.scoped.objectiveIndicator.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    })) as IndicatorRow | null;
    if (!row) {
      throw new NotFoundException(`ObjectiveIndicator ${id} not found`);
    }
    return row;
  }

  private async findMetricOrThrow(metricId: string, orgId: string): Promise<MetricRef> {
    const metric = (await this.prisma.scoped.metric.findFirst({
      where: { id: metricId, organizationId: orgId, deletedAt: null },
      select: METRIC_REF_SELECT,
    })) as MetricRef | null;
    if (!metric) {
      throw new NotFoundException(`Metric ${metricId} not found`);
    }
    return metric;
  }

  private async assertPairAvailable(objectiveId: string, metricId: string, orgId: string): Promise<void> {
    const clash = await this.prisma.scoped.objectiveIndicator.findFirst({
      where: { objectiveId, metricId, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('IndicatorAlreadyLinked: esa métrica ya es un indicador de este objetivo.');
    }
  }

  private assertBaselineTargetDiffer(baseline: string, target: string): void {
    if (parseDecimal4(baseline) === parseDecimal4(target)) {
      throw new UnprocessableEntityException(
        'IndicatorBaselineEqualsTarget: la línea base y la meta no pueden ser iguales.',
      );
    }
  }

  /** La dirección debe coincidir con el signo de (meta - base): creciente => meta > base; decreciente => meta < base. */
  private assertDirectionMatchesTarget(direction: MetricDirection, baseline: string, target: string): void {
    const span = parseDecimal4(target) - parseDecimal4(baseline);
    if ((direction === 'increasing' && span < 0n) || (direction === 'decreasing' && span > 0n)) {
      throw new UnprocessableEntityException(
        `IndicatorDirectionMismatch: un indicador ${direction === 'increasing' ? 'creciente' : 'decreciente'} necesita una meta ${direction === 'increasing' ? 'mayor' : 'menor'} que la línea base.`,
      );
    }
  }

  /** RN-P14b: `execution_feeds_indicator` solo para métricas `output`. */
  private assertLinkModeAllowedForKind(linkMode: ObjectiveIndicatorLinkMode, kind: MetricKind): void {
    if (linkMode === 'execution_feeds_indicator' && kind !== 'output') {
      throw new UnprocessableEntityException(
        'LinkModeRequiresOutputMetric: solo los indicadores de producto (kind = output) pueden recibir aportes de proyectos (RN-P12/RN-P14b).',
      );
    }
  }

  private async loadIncrements(tx: PrismaTransactionClient, metricId: string, orgId: string): Promise<string[]> {
    const entries = await tx.metricEntry.findMany({
      where: { metricId, organizationId: orgId, deletedAt: null },
      select: { incrementValue: true },
    });
    return entries.map((e) => e.incrementValue.toString());
  }

  /** Hidratación de lectura (fuera de transacción): métrica y cargas por el cliente con scoping. */
  private async toDtos(rows: IndicatorRow[], orgId: string): Promise<ObjectiveIndicatorDto[]> {
    if (rows.length === 0) return [];
    const metricIds = [...new Set(rows.map((r) => r.metricId))];
    const metrics = (await this.prisma.scoped.metric.findMany({
      where: { id: { in: metricIds }, organizationId: orgId },
      select: METRIC_REF_SELECT,
    })) as MetricRef[];
    const entries = (await this.prisma.scoped.metricEntry.findMany({
      where: { metricId: { in: metricIds }, organizationId: orgId, deletedAt: null },
      select: { metricId: true, incrementValue: true },
    })) as Array<{ metricId: string; incrementValue: Decimalish }>;
    return this.assembleDtos(rows, metrics, entries);
  }

  /** Hidratación dentro de la transacción de escritura (lee lo recién escrito). */
  private async toTxDtos(
    tx: PrismaTransactionClient,
    rows: IndicatorRow[],
    orgId: string,
  ): Promise<ObjectiveIndicatorDto[]> {
    if (rows.length === 0) return [];
    const metricIds = [...new Set(rows.map((r) => r.metricId))];
    const metrics = (await tx.metric.findMany({
      where: { id: { in: metricIds }, organizationId: orgId },
      select: METRIC_REF_SELECT,
    })) as MetricRef[];
    const entries = await tx.metricEntry.findMany({
      where: { metricId: { in: metricIds }, organizationId: orgId, deletedAt: null },
      select: { metricId: true, incrementValue: true },
    });
    return this.assembleDtos(rows, metrics, entries);
  }

  private async toTxDto(tx: PrismaTransactionClient, row: IndicatorRow, orgId: string): Promise<ObjectiveIndicatorDto> {
    const [dto] = await this.toTxDtos(tx, [row], orgId);
    return dto as ObjectiveIndicatorDto;
  }

  private assembleDtos(
    rows: IndicatorRow[],
    metrics: MetricRef[],
    entries: Array<{ metricId: string; incrementValue: Decimalish }>,
  ): ObjectiveIndicatorDto[] {
    const metricsById = new Map(metrics.map((m) => [m.id, m]));
    return rows.map((row) => {
      const metric = metricsById.get(row.metricId);
      if (!metric) {
        // FK RESTRICT: un indicador vivo siempre tiene su métrica. Su ausencia es un error de programación.
        throw new NotFoundException(`Metric ${row.metricId} not found`);
      }
      const increments = entries.filter((e) => e.metricId === row.metricId).map((e) => e.incrementValue.toString());
      return {
        id: row.id,
        objectiveId: row.objectiveId,
        metricId: row.metricId,
        metricName: metric.name,
        unit: metric.unit as MetricUnit,
        frequency: metric.frequency as MetricFrequency,
        kind: metric.kind as MetricKind,
        baselineValue: row.baselineValue.toString(),
        targetValue: row.targetValue.toString(),
        direction: row.direction as MetricDirection,
        weightBp: row.weightBp,
        expectedCurveMode: row.expectedCurveMode as ExpectedCurveMode,
        linkMode: row.linkMode as ObjectiveIndicatorLinkMode,
        lastValue: accumulatedValue(metric.baselineValue.toString(), increments),
        hasData: increments.length > 0,
        progressCachedBp: row.progressCachedBp,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
}
