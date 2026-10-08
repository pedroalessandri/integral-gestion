/**
 * Evento de dominio `indicator.progress_changed` (ADR-0009 D5): `metrics` -> `okr`.
 * Se emite DESPUÉS del commit de la transacción que cambió el avance de un indicador (o su peso, alta o baja).
 * El oyente de `okr` es idempotente: setea `Objective.resultProgressCachedBp` y escribe su propio audit.
 * Lleva organización y actor porque el oyente corre fuera de la transacción y del request originales.
 * Solo lectura de RESULTADO: nunca se combina con la de gestión.
 */
export const INDICATOR_PROGRESS_CHANGED = 'indicator.progress_changed' as const;

export interface IndicatorProgressChangedEvent {
  organizationId: string;
  /** Usuario que originó el cambio (actor del audit del oyente). */
  actorId: string;
  /** Request que originó el cambio (correlación del audit). */
  requestId: string;
  objectiveIndicatorId: string;
  objectiveId: string;
  /** Avance del indicador (bp, 0..10000). En una baja, el último que tenía. */
  progressBp: number;
  /** Avance de resultado agregado del objetivo (bp, 0..10000), ya calculado con `computeResultProgress`. */
  objectiveResultProgressBp: number;
}
