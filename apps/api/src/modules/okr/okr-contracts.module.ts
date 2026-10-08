import { Global, Injectable, Module } from '@nestjs/common';
import {
  AXIS_OBJECTIVE_COUNTER,
  AXIS_OBJECTIVE_UNASSIGNER,
  OBJECTIVE_LOOKUP,
  OBJECTIVE_PROGRESS_READER,
  ORG_UNIT_OBJECTIVE_COUNTER,
  PROJECT_LINK_READER,
  type ObjectiveAxisCounter,
  type ObjectiveAxisUnassigner,
  type ObjectiveLookup,
  type ObjectiveProgressReader,
  type ObjectiveProgressReading,
  type ObjectiveOrgUnitCounter,
  type ObjectiveRef,
  type ProjectLinkReader,
  type ProjectLinkRef,
} from '../../common/contracts/index.js';
import { plannedExecutionProgress } from '@gestion-publica/okr-domain';
import { PrismaService } from '../auth/prisma/prisma.service.js';
import {
  AuditEventEmitterService,
  AuditModule,
  NoActiveTransactionError,
  transactionContextStorage,
} from '../audit/index.js';

/**
 * Implementación de `ORG_UNIT_OBJECTIVE_COUNTER` (ADR-0009 D5): objetivos vivos asignados a una unidad.
 * Solo lectura y depende únicamente de PrismaService (sin ciclos de DI). Filtra siempre por organizationId.
 */
@Injectable()
export class PrismaObjectiveOrgUnitCounter implements ObjectiveOrgUnitCounter {
  constructor(private readonly prisma: PrismaService) {}

  countLiveObjectivesByOrgUnit(organizationId: string, orgUnitId: string): Promise<number> {
    return this.prisma.raw.objective.count({ where: { organizationId, orgUnitId, deletedAt: null } });
  }
}

/** Implementación de `AXIS_OBJECTIVE_COUNTER`: objetivos vivos asignados a un eje. */
@Injectable()
export class PrismaObjectiveAxisCounter implements ObjectiveAxisCounter {
  constructor(private readonly prisma: PrismaService) {}

  countLiveObjectivesByAxis(organizationId: string, axisId: string): Promise<number> {
    return this.prisma.raw.objective.count({ where: { organizationId, axisId, deletedAt: null } });
  }
}

/**
 * Implementación de `AXIS_OBJECTIVE_UNASSIGNER`: al borrar un eje, deja `axisId = null` en sus objetivos
 * dentro de la transacción activa y audita cada `objective.updated` (mismo formato antes/después que el update normal).
 */
@Injectable()
export class PrismaObjectiveAxisUnassigner implements ObjectiveAxisUnassigner {
  constructor(private readonly auditEmitter: AuditEventEmitterService) {}

  async unassignAxisFromObjectives(organizationId: string, axisId: string): Promise<string[]> {
    const tx = transactionContextStorage.getStore();
    if (!tx) throw new NoActiveTransactionError(PrismaObjectiveAxisUnassigner.name);

    const objectives = await tx.objective.findMany({
      where: { organizationId, axisId, deletedAt: null },
      select: { id: true },
    });
    const ids = objectives.map((o) => o.id);
    if (ids.length === 0) return ids;

    await tx.objective.updateMany({ where: { id: { in: ids }, organizationId }, data: { axisId: null } });
    for (const id of ids) {
      await this.auditEmitter.emit({
        action: 'objective.updated',
        entityType: 'okr.objective',
        entityId: id,
        diff: { before: { axisId }, after: { axisId: null } },
      });
    }
    return ids;
  }
}

function toObjectiveRef(objective: {
  id: string;
  periodId: string;
  orgUnitId: string | null;
  period: { id: string; code: string; status: string };
}): ObjectiveRef {
  return {
    id: objective.id,
    periodId: objective.periodId,
    orgUnitId: objective.orgUnitId,
    period: {
      id: objective.period.id,
      code: objective.period.code,
      status: objective.period.status as 'open' | 'closed' | 'future',
    },
  };
}

/** Implementación de `OBJECTIVE_LOOKUP`: objetivo vivo de la org con su período (para validar indicadores). */
@Injectable()
export class PrismaObjectiveLookup implements ObjectiveLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findLiveObjective(organizationId: string, objectiveId: string): Promise<ObjectiveRef | null> {
    const objective = await this.prisma.raw.objective.findFirst({
      where: { id: objectiveId, organizationId, deletedAt: null },
      select: {
        id: true,
        periodId: true,
        orgUnitId: true,
        period: { select: { id: true, code: true, status: true } },
      },
    });
    if (!objective) return null;
    return toObjectiveRef(objective);
  }

  async findLiveObjectives(organizationId: string, objectiveIds: ReadonlyArray<string>): Promise<ObjectiveRef[]> {
    if (objectiveIds.length === 0) return [];
    const rows = await this.prisma.raw.objective.findMany({
      where: { id: { in: [...objectiveIds] }, organizationId, deletedAt: null },
      select: {
        id: true,
        periodId: true,
        orgUnitId: true,
        period: { select: { id: true, code: true, status: true } },
      },
    });
    return rows.map(toObjectiveRef);
  }

  async filterLiveObjectiveIds(organizationId: string, objectiveIds: ReadonlyArray<string>): Promise<string[]> {
    if (objectiveIds.length === 0) return [];
    const rows = await this.prisma.raw.objective.findMany({
      where: { id: { in: [...objectiveIds] }, organizationId, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

/**
 * Implementación de `OBJECTIVE_PROGRESS_READER`: cachés de las dos lecturas del objetivo y el avance de gestión
 * planificado por fechas (RN-P9). La matemática es de `okr-domain` (`plannedExecutionProgress`); acá solo se cargan
 * los datos. Filtra siempre por organizationId.
 */
@Injectable()
export class PrismaObjectiveProgressReader implements ObjectiveProgressReader {
  constructor(private readonly prisma: PrismaService) {}

  async readObjectiveProgress(
    organizationId: string,
    objectiveId: string,
    at: Date,
  ): Promise<ObjectiveProgressReading | null> {
    const objective = await this.prisma.raw.objective.findFirst({
      where: { id: objectiveId, organizationId, deletedAt: null },
      select: { resultProgressCachedBp: true, executionProgressCachedBp: true },
    });
    if (!objective) return null;

    const projects = await this.prisma.raw.project.findMany({
      where: { objectiveId, organizationId, deletedAt: null },
      select: {
        weightBp: true,
        tasks: { where: { organizationId, deletedAt: null }, select: { startsAt: true, endsAt: true, weightBp: true } },
      },
    });

    return {
      resultProgressBp: objective.resultProgressCachedBp,
      executionProgressBp: objective.executionProgressCachedBp,
      plannedExecutionProgressBp: plannedExecutionProgress(projects, at),
    };
  }
}

const PROJECT_LINK_SELECT = {
  id: true,
  objectiveId: true,
  orgUnitId: true,
  title: true,
  endsAt: true,
  progressCachedBp: true,
  progressMode: true,
  sourceObjectiveIndicatorId: true,
} as const;

function toProjectLinkRef(row: {
  id: string;
  objectiveId: string;
  orgUnitId: string | null;
  title: string;
  endsAt: Date;
  progressCachedBp: number;
  progressMode: string;
  sourceObjectiveIndicatorId: string | null;
}): ProjectLinkRef {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    orgUnitId: row.orgUnitId,
    title: row.title,
    endsAt: row.endsAt,
    progressBp: row.progressCachedBp,
    progressMode: row.progressMode as ProjectLinkRef['progressMode'],
    sourceObjectiveIndicatorId: row.sourceObjectiveIndicatorId,
  };
}

/**
 * Implementación de `PROJECT_LINK_READER`: proyectos vivos que `metrics` necesita para validar y armar los aportes a
 * indicadores (RN-P12/P17). Solo lectura. Filtra siempre por organizationId y por `deletedAt: null`.
 */
@Injectable()
export class PrismaProjectLinkReader implements ProjectLinkReader {
  constructor(private readonly prisma: PrismaService) {}

  async findLiveProject(organizationId: string, projectId: string): Promise<ProjectLinkRef | null> {
    const row = await this.prisma.raw.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: PROJECT_LINK_SELECT,
    });
    return row ? toProjectLinkRef(row) : null;
  }

  async findLiveProjects(organizationId: string, projectIds: ReadonlyArray<string>): Promise<ProjectLinkRef[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.prisma.raw.project.findMany({
      where: { id: { in: [...projectIds] }, organizationId, deletedAt: null },
      select: PROJECT_LINK_SELECT,
    });
    return rows.map(toProjectLinkRef);
  }

  async findLiveProjectsBySourceIndicator(
    organizationId: string,
    objectiveIndicatorId: string,
  ): Promise<ProjectLinkRef[]> {
    const rows = await this.prisma.raw.project.findMany({
      where: { organizationId, sourceObjectiveIndicatorId: objectiveIndicatorId, deletedAt: null },
      select: PROJECT_LINK_SELECT,
    });
    return rows.map(toProjectLinkRef);
  }
}

/**
 * Submódulo @Global de contratos de `okr`: solo lo importa AppModule. Si falta el provider,
 * Nest falla al arrancar (preferible a una validación que pasa en silencio).
 */
@Global()
@Module({
  imports: [AuditModule],
  providers: [
    { provide: ORG_UNIT_OBJECTIVE_COUNTER, useClass: PrismaObjectiveOrgUnitCounter },
    { provide: AXIS_OBJECTIVE_COUNTER, useClass: PrismaObjectiveAxisCounter },
    { provide: AXIS_OBJECTIVE_UNASSIGNER, useClass: PrismaObjectiveAxisUnassigner },
    { provide: OBJECTIVE_LOOKUP, useClass: PrismaObjectiveLookup },
    { provide: OBJECTIVE_PROGRESS_READER, useClass: PrismaObjectiveProgressReader },
    { provide: PROJECT_LINK_READER, useClass: PrismaProjectLinkReader },
  ],
  exports: [
    ORG_UNIT_OBJECTIVE_COUNTER,
    AXIS_OBJECTIVE_COUNTER,
    AXIS_OBJECTIVE_UNASSIGNER,
    OBJECTIVE_LOOKUP,
    OBJECTIVE_PROGRESS_READER,
    PROJECT_LINK_READER,
  ],
})
export class OkrContractsModule {}
