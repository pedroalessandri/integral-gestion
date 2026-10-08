import { Global, Injectable, Module } from '@nestjs/common';
import {
  AXIS_OBJECTIVE_COUNTER,
  AXIS_OBJECTIVE_UNASSIGNER,
  OBJECTIVE_LOOKUP,
  ORG_UNIT_OBJECTIVE_COUNTER,
  type ObjectiveAxisCounter,
  type ObjectiveAxisUnassigner,
  type ObjectiveLookup,
  type ObjectiveOrgUnitCounter,
  type ObjectiveRef,
} from '../../common/contracts/index.js';
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
        period: { select: { id: true, code: true, status: true } },
      },
    });
    if (!objective) return null;
    return {
      id: objective.id,
      periodId: objective.periodId,
      period: {
        id: objective.period.id,
        code: objective.period.code,
        status: objective.period.status as 'open' | 'closed' | 'future',
      },
    };
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
  ],
  exports: [
    ORG_UNIT_OBJECTIVE_COUNTER,
    AXIS_OBJECTIVE_COUNTER,
    AXIS_OBJECTIVE_UNASSIGNER,
    OBJECTIVE_LOOKUP,
    ],
})
export class OkrContractsModule {}
