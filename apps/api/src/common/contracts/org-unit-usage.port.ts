/**
 * Puerto `ORG_UNIT_OBJECTIVE_COUNTER` (ADR-0009 D5, regla 15 de CLAUDE.md).
 *
 * Lo implementa `okr` (dueño de `okr.objective`) y lo inyecta `core` para validar,
 * de forma sincrónica y sin importar `okr`, que una unidad no tenga objetivos
 * asignados antes de borrarla.
 */
export interface ObjectiveOrgUnitCounter {
  /** Cantidad de objetivos vivos (no borrados) asignados a la unidad dentro de la organización. */
  countLiveObjectivesByOrgUnit(organizationId: string, orgUnitId: string): Promise<number>;
}

export const ORG_UNIT_OBJECTIVE_COUNTER = Symbol('ORG_UNIT_OBJECTIVE_COUNTER');
