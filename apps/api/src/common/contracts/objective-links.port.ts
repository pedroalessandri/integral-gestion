/**
 * Puertos de validación de los vínculos de un Objective (ADR-0009 D5, regla 15 de CLAUDE.md).
 *
 * `okr` valida de forma sincrónica, sin importar `core` ni `planning`, que la unidad y el eje
 * que se asignan a un objetivo existan y sean válidos. Los implementan sus módulos dueños
 * (solo lectura, dependen únicamente de PrismaService).
 */

/** Unidad vista desde `okr`: solo lo necesario para validar RN-P3. */
export interface OrgUnitRef {
  id: string;
  kind: 'central' | 'ministry' | 'area';
}

/** Implementa `core` (dueño de `core.org_unit`), inyecta `okr`. */
export interface OrgUnitLookup {
  /** Unidad no borrada de la organización, o `null` si no existe o es de otra org. */
  findLiveOrgUnit(organizationId: string, orgUnitId: string): Promise<OrgUnitRef | null>;
}

export const ORG_UNIT_LOOKUP = Symbol('ORG_UNIT_LOOKUP');

/** Implementa `planning` (dueño de `planning.axis`), inyecta `okr`. */
export interface ActiveAxisLookup {
  /** `true` si el eje existe, no está borrado y pertenece al plan activo de la organización. */
  isAxisInActivePlan(organizationId: string, axisId: string): Promise<boolean>;
}

export const ACTIVE_AXIS_LOOKUP = Symbol('ACTIVE_AXIS_LOOKUP');

/** Implementa `okr` (dueño de `okr.objective`), inyecta `planning` para validar el borrado de un eje. */
export interface ObjectiveAxisCounter {
  /** Cantidad de objetivos vivos asignados al eje dentro de la organización. */
  countLiveObjectivesByAxis(organizationId: string, axisId: string): Promise<number>;
}

export const AXIS_OBJECTIVE_COUNTER = Symbol('AXIS_OBJECTIVE_COUNTER');

/** Implementa `okr`, inyecta `planning`: deja sin eje a los objetivos de un eje que se borra. */
export interface ObjectiveAxisUnassigner {
  /**
   * Pone `axisId = null` en los objetivos vivos del eje dentro de la organización y emite el
   * `objective.updated` de cada uno. Se une a la transacción activa (PrismaService.runInTransaction);
   * sin transacción activa falla. Devuelve los ids afectados.
   */
  unassignAxisFromObjectives(organizationId: string, axisId: string): Promise<string[]>;
}

export const AXIS_OBJECTIVE_UNASSIGNER = Symbol('AXIS_OBJECTIVE_UNASSIGNER');
