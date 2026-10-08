import { Inject, Injectable } from '@nestjs/common';
import type { IndicatorProgressChangedEvent } from '@gestion-publica/shared-types/metrics';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { bucketContaining, formatDecimal4, parseDecimal4 } from '@gestion-publica/metrics-domain';
import type { MetricFrequency } from '@gestion-publica/metrics-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import {
  AuditEventEmitterService,
  requestContextStorage,
  type PrismaTransactionClient,
} from '../../audit/index.js';
import { PROJECT_LINK_READER, type ProjectLinkReader } from '../../../common/contracts/index.js';
import { ObjectiveIndicatorService } from './objective-indicator.service.js';

/** Proyecto completo = 100 % en basis points. */
const COMPLETE_BP = 10000;

export interface ReconcileProjectInput {
  organizationId: string;
  /** Usuario que originó el cambio: autor de las cargas automáticas y actor del audit. */
  actorId: string;
  requestId: string;
  projectId: string;
  /** Título del proyecto al momento del evento (respaldo si el proyecto ya no existe). */
  projectTitle: string;
  /** Momento del hecho (cierre, reapertura o baja): define el bucket de la carga. */
  occurredAt: Date;
}

export interface ReconcileResult {
  applied: number;
  reverted: number;
  removed: number;
}

/**
 * Aplica y compensa los aportes de un proyecto a sus indicadores (RN-P13, ADR-0009 D5). Corre DESPUÉS del commit de
 * `okr`, en su propia transacción, y escribe su propio audit.
 *
 * Es una reconciliación contra el ESTADO actual del proyecto (puerto `PROJECT_LINK_READER`), no un procesamiento del
 * evento al pie de la letra, por eso es idempotente y tolera eventos repetidos o desordenados:
 *   - proyecto vivo al 100 % y aporte sin aplicar  -> carga automática +contributionValue, `appliedEntryId` = esa carga;
 *   - proyecto que dejó el 100 % (o no existe más) y aporte aplicado -> carga compensatoria con el signo contrario
 *     de lo que se aplicó (nunca se borra la original) y `appliedEntryId = null`;
 *   - proyecto borrado -> además se da de baja el aporte (su ciclo de vida sigue al del proyecto).
 * Cada aporte se procesa con la fila bloqueada (`FOR UPDATE`): dos reconciliaciones concurrentes no duplican la carga.
 */
@Injectable()
export class ProjectContributionApplier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly objectiveIndicatorService: ObjectiveIndicatorService,
    @Inject(PROJECT_LINK_READER) private readonly projectLinks: ProjectLinkReader,
  ) {}

  async reconcileProject(input: ReconcileProjectInput): Promise<ReconcileResult> {
    const actor: AuthContext = {
      userId: input.actorId,
      auth0Sub: '',
      email: '',
      displayName: '',
      isSuperadmin: false,
      organizationId: input.organizationId,
      permissions: [],
      requestId: input.requestId,
    };
    const project = await this.projectLinks.findLiveProject(input.organizationId, input.projectId);

    const outcome = await requestContextStorage.run({ requestId: input.requestId }, () =>
      tenantContextStorage.run(actor, () =>
        this.prisma.runInTransaction((tx) => this.reconcileInTransaction(tx, input, actor, project)),
      ),
    );
    // ADR-0009 D5: avance de resultado de los objetivos afectados, avisado a `okr` recién después del commit.
    await this.objectiveIndicatorService.publishProgressChanged(outcome.events);
    return outcome.result;
  }

  private async reconcileInTransaction(
    tx: PrismaTransactionClient,
    input: ReconcileProjectInput,
    actor: AuthContext,
    project: { title: string; progressBp: number } | null,
  ): Promise<{ result: ReconcileResult; events: IndicatorProgressChangedEvent[] }> {
    const orgId = input.organizationId;
    const title = project?.title ?? input.projectTitle;
    const complete = project !== null && project.progressBp === COMPLETE_BP;
    const result: ReconcileResult = { applied: 0, reverted: 0, removed: 0 };
    const touchedMetrics = new Set<string>();

    const contributions = await tx.projectContribution.findMany({
      where: { projectId: input.projectId, organizationId: orgId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const { id } of contributions) {
      // Fila bloqueada hasta el commit: serializa reconciliaciones, ediciones y bajas del mismo aporte.
      await tx.$queryRaw`SELECT id FROM "metrics"."project_contribution" WHERE id = ${id} AND organization_id = ${orgId} FOR UPDATE`;
      const contribution = await tx.projectContribution.findFirst({ where: { id, organizationId: orgId } });
      if (!contribution) continue; // dado de baja entre la lectura y el bloqueo

      const indicator = await tx.objectiveIndicator.findFirst({
        where: { id: contribution.objectiveIndicatorId, organizationId: orgId, deletedAt: null },
        select: { id: true, metricId: true, linkMode: true },
      });

      // Indicador borrado: no hay a dónde aplicar ni serie viva que compensar.
      if (indicator) {
        if (complete && contribution.appliedEntryId === null) {
          // Vínculo cambiado a otro modo: no se aplica (cambiarlo con aportes vigentes se rechaza, esto es defensa).
          if (indicator.linkMode === 'execution_feeds_indicator') {
            await this.apply(tx, input, title, contribution, indicator.metricId);
            touchedMetrics.add(indicator.metricId);
            result.applied += 1;
          }
        } else if (!complete && contribution.appliedEntryId !== null) {
          await this.revert(tx, input, title, contribution, indicator.metricId, project === null);
          touchedMetrics.add(indicator.metricId);
          result.reverted += 1;
        }
      }

      if (project === null) {
        await tx.projectContribution.deleteMany({ where: { id, organizationId: orgId } });
        await this.auditEmitter.emit({
          action: 'project_contribution.deleted',
          entityType: 'metrics.project_contribution',
          entityId: id,
          diff: {
            before: {
              projectId: input.projectId,
              objectiveIndicatorId: contribution.objectiveIndicatorId,
              contributionValue: contribution.contributionValue.toString(),
            },
            after: null,
            reason: 'project_deleted',
          },
        });
        result.removed += 1;
      }
    }

    const events: IndicatorProgressChangedEvent[] = [];
    for (const metricId of touchedMetrics) {
      events.push(...(await this.objectiveIndicatorService.recomputeForMetric(tx, metricId, orgId, actor)));
    }
    return { result, events };
  }

  /** Carga positiva en el bucket de la fecha de cierre (RN-P13). */
  private async apply(
    tx: PrismaTransactionClient,
    input: ReconcileProjectInput,
    title: string,
    contribution: { id: string; objectiveIndicatorId: string; contributionValue: { toString(): string } },
    metricId: string,
  ): Promise<void> {
    const incrementValue = contribution.contributionValue.toString();
    const entry = await this.createAutomaticEntry(tx, input, metricId, incrementValue, `Aporte automático — Proyecto ${title}`);
    await tx.projectContribution.updateMany({
      where: { id: contribution.id, organizationId: input.organizationId },
      data: { appliedEntryId: entry.id },
    });
    await this.auditEmitter.emit({
      action: 'project_contribution.applied',
      entityType: 'metrics.project_contribution',
      entityId: contribution.id,
      diff: {
        before: { appliedEntryId: null },
        after: {
          appliedEntryId: entry.id,
          projectId: input.projectId,
          incrementValue,
          bucketDate: entry.bucketDate.toISOString().slice(0, 10),
        },
      },
    });
  }

  /** Carga compensatoria con el signo contrario de lo aplicado; la original queda intacta (RN-C6). */
  private async revert(
    tx: PrismaTransactionClient,
    input: ReconcileProjectInput,
    title: string,
    contribution: { id: string; appliedEntryId: string | null },
    metricId: string,
    projectDeleted: boolean,
  ): Promise<void> {
    const applied = await tx.metricEntry.findFirst({
      where: { id: contribution.appliedEntryId as string, organizationId: input.organizationId },
      select: { id: true, incrementValue: true },
    });
    // Se compensa lo que realmente se aplicó (no el `contributionValue` actual), y nada si la carga ya no existe.
    const incrementValue = applied ? formatDecimal4(-parseDecimal4(applied.incrementValue.toString())) : null;
    const reason = projectDeleted ? 'proyecto eliminado' : 'el proyecto bajó del 100 %';
    let compensationId: string | null = null;
    let bucketDate: string | null = null;
    if (incrementValue !== null) {
      const entry = await this.createAutomaticEntry(
        tx,
        input,
        metricId,
        incrementValue,
        `Aporte revertido — Proyecto ${title} (${reason})`,
      );
      compensationId = entry.id;
      bucketDate = entry.bucketDate.toISOString().slice(0, 10);
    }
    await tx.projectContribution.updateMany({
      where: { id: contribution.id, organizationId: input.organizationId },
      data: { appliedEntryId: null },
    });
    await this.auditEmitter.emit({
      action: 'project_contribution.reverted',
      entityType: 'metrics.project_contribution',
      entityId: contribution.id,
      diff: {
        before: { appliedEntryId: contribution.appliedEntryId },
        after: { appliedEntryId: null, compensationEntryId: compensationId, incrementValue, bucketDate, reason },
      },
    });
  }

  private async createAutomaticEntry(
    tx: PrismaTransactionClient,
    input: ReconcileProjectInput,
    metricId: string,
    incrementValue: string,
    comment: string,
  ): Promise<{ id: string; bucketDate: Date }> {
    const metric = await tx.metric.findFirstOrThrow({
      where: { id: metricId, organizationId: input.organizationId },
      select: { frequency: true, period: { select: { startsAt: true, endsAt: true } } },
    });
    const bucketDate = bucketContaining(
      input.occurredAt,
      { startsAt: metric.period.startsAt, endsAt: metric.period.endsAt },
      metric.frequency as MetricFrequency,
    );
    const entry = await tx.metricEntry.create({
      data: {
        metricId,
        organizationId: input.organizationId,
        bucketDate,
        incrementValue,
        comment,
        origin: 'project_contribution',
        sourceProjectId: input.projectId,
        createdByUserId: input.actorId,
      },
    });
    await this.auditEmitter.emit({
      action: 'metric.entry.created',
      entityType: 'metrics.metric_entry',
      entityId: entry.id,
      diff: {
        before: null,
        after: {
          metricId,
          bucketDate: bucketDate.toISOString(),
          incrementValue,
          comment,
          origin: 'project_contribution',
          sourceProjectId: input.projectId,
        },
      },
    });
    return { id: entry.id, bucketDate };
  }
}
