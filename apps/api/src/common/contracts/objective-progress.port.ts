/**
 * Puerto de lectura de `metrics` hacia `okr` para el estado de un objetivo (ADR-0009 D5 / regla 15 de CLAUDE.md):
 * `metrics` arma el estado de las dos lecturas sin importar `okr`. Lo implementa `okr` (solo lectura, depende
 * únicamente de Prisma). Devuelve los cachés tal como están y el avance planificado por fechas; las dos lecturas
 * van separadas y nunca se combinan.
 */

/** Lecturas de avance de un objetivo, en bp (0..10000). */
export interface ObjectiveProgressReading {
  /** `Objective.resultProgressCachedBp`. */
  resultProgressBp: number;
  /** `Objective.executionProgressCachedBp`. */
  executionProgressBp: number;
  /** Avance de gestión PLANIFICADO a `at` según las fechas de las tareas (RN-P9, `okr-domain`). */
  plannedExecutionProgressBp: number;
}

/** Implementa `okr`, inyecta `metrics`. */
export interface ObjectiveProgressReader {
  /** Lecturas del objetivo vivo de la organización, o `null` si no existe, está borrado o es de otra org. */
  readObjectiveProgress(
    organizationId: string,
    objectiveId: string,
    at: Date,
  ): Promise<ObjectiveProgressReading | null>;
}

export const OBJECTIVE_PROGRESS_READER = Symbol('OBJECTIVE_PROGRESS_READER');
