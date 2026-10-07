import { Global, Module } from '@nestjs/common';
import {
  ORG_UNIT_OBJECTIVE_COUNTER,
  type ObjectiveOrgUnitCounter,
} from '../../common/contracts/index.js';

/**
 * Implementación de `ORG_UNIT_OBJECTIVE_COUNTER` (ADR-0009 D5).
 *
 * TODO(C05): `okr.objective.org_unit_id` todavía no existe (llega con C05), así que
 * por ahora ninguna unidad puede tener objetivos asignados y el contador devuelve 0.
 * En C05 reemplazar por un count real sobre `PrismaService` (solo lectura, sin ciclos de DI).
 */
export class PendingObjectiveOrgUnitCounter implements ObjectiveOrgUnitCounter {
  countLiveObjectivesByOrgUnit(): Promise<number> {
    return Promise.resolve(0);
  }
}

/**
 * Submódulo @Global de contratos de `okr`: solo lo importa AppModule. Si falta el provider,
 * Nest falla al arrancar (preferible a una validación que pasa en silencio).
 */
@Global()
@Module({
  providers: [{ provide: ORG_UNIT_OBJECTIVE_COUNTER, useClass: PendingObjectiveOrgUnitCounter }],
  exports: [ORG_UNIT_OBJECTIVE_COUNTER],
})
export class OkrContractsModule {}
