import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ProjectContributionDto } from '@gestion-publica/shared-types/metrics';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import {
  AuditEventEmitterService,
  requestContextStorage,
  type PrismaTransactionClient,
} from '../../audit/index.js';
import {
  OBJECTIVE_LOOKUP,
  PROJECT_LINK_READER,
  type ObjectiveLookup,
  type ProjectLinkReader,
  type ProjectLinkRef,
} from '../../../common/contracts/index.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import type { CreateProjectContributionDto, UpdateProjectContributionDto } from '../dto/project-contribution.dto.js';
import { ProjectContributionApplier } from './project-contribution-applier.service.js';

type Decimalish = { toString(): string };

interface ContributionRow {
  id: string;
  organizationId: string;
  projectId: string;
  objectiveIndicatorId: string;
  contributionValue: Decimalish;
  appliedEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface IndicatorRef {
  id: string;
  objectiveId: string;
  metricId: string;
  linkMode: string;
}

/**
 * ABM de aportes de proyectos a indicadores (RN-P12/P13/P14, ADR-0009 D2/D5). Validaciones 422 tipadas:
 *  - el indicador es de una métrica `output` y su `linkMode` es `execution_feeds_indicator`;
 *  - el proyecto existe (puerto `PROJECT_LINK_READER`, `metrics` no importa `okr`), es del mismo objetivo y no toma
 *    su avance de ese indicador (un mismo par no puede usar los dos sentidos, ADR-0009 D5 regla 1).
 *
 * Un aporte YA APLICADO (hay una carga automática vigente) no se edita ni se borra: primero hay que reabrir el
 * proyecto (así el aporte se compensa) para no dejar la serie del indicador desfasada del aporte.
 * Un proyecto que ya está al 100 % al crear el aporte lo aplica enseguida (misma reconciliación que el evento).
 */
@Injectable()
export class ProjectContributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly applier: ProjectContributionApplier,
    @Inject(OBJECTIVE_LOOKUP) private readonly objectiveLookup: ObjectiveLookup,
    @Inject(PROJECT_LINK_READER) private readonly projectLinks: ProjectLinkReader,
  ) {}

  async listByIndicator(indicatorId: string, orgId: string): Promise<ProjectContributionDto[]> {
    await this.findIndicatorOrThrow(indicatorId, orgId);
    const rows = (await this.prisma.scoped.projectContribution.findMany({
      where: { objectiveIndicatorId: indicatorId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    })) as ContributionRow[];
    return this.toDtos(rows, orgId);
  }

  async listByProject(projectId: string, orgId: string): Promise<ProjectContributionDto[]> {
    const project = await this.projectLinks.findLiveProject(orgId, projectId);
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    const rows = (await this.prisma.scoped.projectContribution.findMany({
      where: { projectId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    })) as ContributionRow[];
    return this.toDtos(rows, orgId);
  }

  async create(
    indicatorId: string,
    orgId: string,
    dto: CreateProjectContributionDto,
    authContext: AuthContext,
  ): Promise<ProjectContributionDto> {
    const indicator = await this.findIndicatorOrThrow(indicatorId, orgId);
    const objective = await this.objectiveLookup.findLiveObjective(orgId, indicator.objectiveId);
    if (!objective) {
      throw new NotFoundException(`Objective ${indicator.objectiveId} not found`);
    }
    assertPeriodOpen(objective.period);
    await this.assertIndicatorAcceptsContributions(indicator, orgId);

    const project = await this.projectLinks.findLiveProject(orgId, dto.projectId);
    if (!project) {
      throw new UnprocessableEntityException(
        `ContributionProjectNotFound: el proyecto "${dto.projectId}" no existe en la organización.`,
      );
    }
    this.assertProjectCompatible(project, indicator);

    const created = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        // Mismo lock del grupo de indicadores del objetivo que usa el update del indicador: un cambio de `linkMode`
        // concurrente no se cruza con el alta del aporte.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${indicator.objectiveId}))`;
        const fresh = await tx.objectiveIndicator.findFirst({
          where: { id: indicatorId, organizationId: orgId, deletedAt: null },
          select: { linkMode: true },
        });
        if (!fresh || fresh.linkMode !== 'execution_feeds_indicator') {
          throw this.linkModeError();
        }
        const clash = await tx.projectContribution.findFirst({
          where: { projectId: project.id, objectiveIndicatorId: indicatorId, organizationId: orgId },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException(
            'ContributionAlreadyExists: ese proyecto ya aporta a este indicador; editá el aporte existente.',
          );
        }
        const row = (await tx.projectContribution.create({
          data: {
            organizationId: orgId,
            projectId: project.id,
            objectiveIndicatorId: indicatorId,
            contributionValue: dto.contributionValue,
          },
        })) as ContributionRow;
        await this.auditEmitter.emit({
          action: 'project_contribution.created',
          entityType: 'metrics.project_contribution',
          entityId: row.id,
          diff: {
            before: null,
            after: {
              projectId: row.projectId,
              objectiveIndicatorId: row.objectiveIndicatorId,
              contributionValue: row.contributionValue.toString(),
            },
          },
        });
        return row;
      }),
    );

    // El proyecto ya estaba al 100 %: el evento de cierre pasó antes de que existiera este aporte, así que se
    // aplica ahora con la misma reconciliación (idempotente) que usa el oyente.
    if (project.progressBp === 10000) {
      await this.applier.reconcileProject({
        organizationId: orgId,
        actorId: authContext.userId,
        requestId: requestContextStorage.getStore()?.requestId ?? authContext.requestId,
        projectId: project.id,
        projectTitle: project.title,
        occurredAt: new Date(),
      });
    }
    return this.toDto(await this.reload(created.id, orgId), project);
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateProjectContributionDto,
    authContext: AuthContext,
  ): Promise<ProjectContributionDto> {
    const existing = await this.findContributionOrThrow(id, orgId);
    const indicator = await this.findIndicatorOrThrow(existing.objectiveIndicatorId, orgId);
    await this.assertPeriodOpenFor(indicator, orgId);

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const current = await this.lockContribution(tx, id, orgId);
        this.assertNotApplied(current);
        if (current.contributionValue.toString() === dto.contributionValue) return;
        await tx.projectContribution.updateMany({
          where: { id, organizationId: orgId },
          data: { contributionValue: dto.contributionValue },
        });
        await this.auditEmitter.emit({
          action: 'project_contribution.updated',
          entityType: 'metrics.project_contribution',
          entityId: id,
          diff: {
            before: { contributionValue: current.contributionValue.toString() },
            after: { contributionValue: dto.contributionValue },
          },
        });
      }),
    );
    const project = await this.projectLinks.findLiveProject(orgId, existing.projectId);
    return this.toDto(await this.reload(id, orgId), project);
  }

  async remove(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.findContributionOrThrow(id, orgId);
    const indicator = await this.findIndicatorOrThrow(existing.objectiveIndicatorId, orgId);
    await this.assertPeriodOpenFor(indicator, orgId);

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const current = await this.lockContribution(tx, id, orgId);
        this.assertNotApplied(current);
        await tx.projectContribution.deleteMany({ where: { id, organizationId: orgId } });
        await this.auditEmitter.emit({
          action: 'project_contribution.deleted',
          entityType: 'metrics.project_contribution',
          entityId: id,
          diff: {
            before: {
              projectId: current.projectId,
              objectiveIndicatorId: current.objectiveIndicatorId,
              contributionValue: current.contributionValue.toString(),
            },
            after: null,
          },
        });
      }),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async assertIndicatorAcceptsContributions(indicator: IndicatorRef, orgId: string): Promise<void> {
    const metric = await this.prisma.scoped.metric.findFirst({
      where: { id: indicator.metricId, organizationId: orgId, deletedAt: null },
      select: { kind: true },
    });
    if (!metric) {
      throw new NotFoundException(`Metric ${indicator.metricId} not found`);
    }
    if (metric.kind !== 'output') {
      throw new UnprocessableEntityException(
        'ContributionRequiresOutputMetric: solo los indicadores de producto (kind = output) reciben aportes de proyectos (RN-P12).',
      );
    }
    if (indicator.linkMode !== 'execution_feeds_indicator') {
      throw this.linkModeError();
    }
  }

  private linkModeError(): UnprocessableEntityException {
    return new UnprocessableEntityException(
      'ContributionRequiresExecutionFeedsMode: el indicador debe tener el vínculo "execution_feeds_indicator" para recibir aportes de proyectos (RN-P14b).',
    );
  }

  private assertProjectCompatible(project: ProjectLinkRef, indicator: IndicatorRef): void {
    if (project.objectiveId !== indicator.objectiveId) {
      throw new UnprocessableEntityException(
        'ContributionProjectObjectiveMismatch: el proyecto y el indicador deben ser del mismo objetivo.',
      );
    }
    if (project.progressMode === 'from_indicator' && project.sourceObjectiveIndicatorId === indicator.id) {
      throw new UnprocessableEntityException(
        'ContributionProjectFeedsFromIndicator: el proyecto toma su avance de este indicador; un mismo par proyecto-indicador no puede usar los dos sentidos (ADR-0009 D5).',
      );
    }
  }

  private assertNotApplied(row: { appliedEntryId: string | null }): void {
    if (row.appliedEntryId !== null) {
      throw new UnprocessableEntityException(
        'ContributionAlreadyApplied: el aporte ya se aplicó al indicador porque el proyecto está completo. Reabrí el proyecto (el aporte se compensa solo) antes de editarlo o borrarlo.',
      );
    }
  }

  /** Fila bloqueada (`FOR UPDATE`) y releída: serializa con la reconciliación que aplica o compensa el aporte. */
  private async lockContribution(tx: PrismaTransactionClient, id: string, orgId: string): Promise<ContributionRow> {
    await tx.$queryRaw`SELECT id FROM "metrics"."project_contribution" WHERE id = ${id} AND organization_id = ${orgId} FOR UPDATE`;
    const row = (await tx.projectContribution.findFirst({
      where: { id, organizationId: orgId },
    })) as ContributionRow | null;
    if (!row) {
      throw new NotFoundException(`ProjectContribution ${id} not found`);
    }
    return row;
  }

  private async assertPeriodOpenFor(indicator: IndicatorRef, orgId: string): Promise<void> {
    const objective = await this.objectiveLookup.findLiveObjective(orgId, indicator.objectiveId);
    if (!objective) {
      throw new NotFoundException(`Objective ${indicator.objectiveId} not found`);
    }
    assertPeriodOpen(objective.period);
  }

  private async findIndicatorOrThrow(id: string, orgId: string): Promise<IndicatorRef> {
    const row = (await this.prisma.scoped.objectiveIndicator.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      select: { id: true, objectiveId: true, metricId: true, linkMode: true },
    })) as IndicatorRef | null;
    if (!row) {
      throw new NotFoundException(`ObjectiveIndicator ${id} not found`);
    }
    return row;
  }

  private async findContributionOrThrow(id: string, orgId: string): Promise<ContributionRow> {
    const row = (await this.prisma.scoped.projectContribution.findFirst({
      where: { id, organizationId: orgId },
    })) as ContributionRow | null;
    if (!row) {
      throw new NotFoundException(`ProjectContribution ${id} not found`);
    }
    return row;
  }

  private async reload(id: string, orgId: string): Promise<ContributionRow> {
    return this.findContributionOrThrow(id, orgId);
  }

  /** Solo aportes de proyectos vivos: el aporte de un proyecto borrado se da de baja con el proyecto. */
  private async toDtos(rows: ContributionRow[], orgId: string): Promise<ProjectContributionDto[]> {
    const projects = await this.projectLinks.findLiveProjects(orgId, [...new Set(rows.map((r) => r.projectId))]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    return rows.flatMap((row) => {
      const project = byId.get(row.projectId);
      return project ? [this.toDto(row, project)] : [];
    });
  }

  private toDto(row: ContributionRow, project: ProjectLinkRef | null): ProjectContributionDto {
    return {
      id: row.id,
      projectId: row.projectId,
      projectTitle: project?.title ?? '',
      objectiveIndicatorId: row.objectiveIndicatorId,
      contributionValue: row.contributionValue.toString(),
      projectProgressBp: project?.progressBp ?? 0,
      projectEndsAt: (project?.endsAt ?? row.createdAt).toISOString(),
      applied: row.appliedEntryId !== null,
      appliedEntryId: row.appliedEntryId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
