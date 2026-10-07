import { Global, Injectable, Module } from '@nestjs/common';
import {
  AXIS_OBJECTIVE_COUNTER,
  AXIS_OBJECTIVE_UNASSIGNER,
  ORG_UNIT_OBJECTIVE_COUNTER,
  type ObjectiveAxisCounter,
  type ObjectiveAxisUnassigner,
  type ObjectiveOrgUnitCounter,
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
  ],
  exports: [ORG_UNIT_OBJECTIVE_COUNTER, AXIS_OBJECTIVE_COUNTER, AXIS_OBJECTIVE_UNASSIGNER],
})
export class OkrContractsModule {}
