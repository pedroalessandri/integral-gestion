/**
 * Puerto de validación sincrónica de `metrics` hacia `okr` (ADR-0009 D5 / regla 15 de CLAUDE.md): `metrics` valida
 * el objetivo de un indicador sin importar `okr`. Lo implementa `okr` (solo lectura, depende únicamente de Prisma).
 * El aviso de cambios de avance va por evento post-commit (`indicator.progress_changed`), no por puerto.
 */

/** Objetivo visto desde `metrics`: lo necesario para validar el período de un indicador. */
export interface ObjectiveRef {
  id: string;
  periodId: string;
  /** Unidad del objetivo (RN-P20): siempre tiene unidad (NOT NULL desde F10). */
  orgUnitId: string;
  period: { id: string; code: string; status: 'open' | 'closed' | 'future' };
}

/** Implementa `okr`, inyecta `metrics`. */
export interface ObjectiveLookup {
  /** Objetivo vivo de la organización, o `null` si no existe, está borrado o es de otra org. */
  findLiveObjective(organizationId: string, objectiveId: string): Promise<ObjectiveRef | null>;
  /** Objetivos vivos de la organización entre los ids dados (los inexistentes, borrados o de otra org se omiten). */
  findLiveObjectives(organizationId: string, objectiveIds: ReadonlyArray<string>): Promise<ObjectiveRef[]>;
  /** De los ids dados, los que son objetivos vivos de la organización. */
  filterLiveObjectiveIds(organizationId: string, objectiveIds: ReadonlyArray<string>): Promise<string[]>;
}

export const OBJECTIVE_LOOKUP = Symbol('OBJECTIVE_LOOKUP');
