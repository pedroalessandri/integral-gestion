/**
 * Eventos de dominio del ciclo de vida de un proyecto (ADR-0009 D5): `okr` -> `metrics`.
 * Se emiten DESPUÉS del commit de la transacción que movió el avance del proyecto (o lo borró), nunca adentro, y
 * solo sirven para efectos post-commit: el oyente de `metrics` aplica (o compensa) los aportes del proyecto a sus
 * indicadores (RN-P13). Las validaciones sincrónicas entre módulos van por puertos, no por estos eventos.
 *
 * El oyente es idempotente y reconcilia contra el ESTADO actual (proyecto vivo al 100 % o no), así que repetir un
 * evento, o recibirlo desordenado, no duplica cargas. Lleva organización, actor y request porque el oyente corre
 * fuera de la transacción y del request originales.
 */
export const PROJECT_COMPLETED = 'project.completed' as const;
export const PROJECT_REOPENED = 'project.reopened' as const;

interface ProjectLifecycleEventBase {
  organizationId: string;
  /** Usuario que originó el cambio (actor del audit del oyente). */
  actorId: string;
  /** Request que originó el cambio (correlación del audit). */
  requestId: string;
  projectId: string;
  projectTitle: string;
  objectiveId: string;
  /** ISO-8601 UTC del momento en que ocurrió el cambio. Define el bucket de la carga automática. */
  occurredAt: string;
}

/** El proyecto llegó al 100 % (`progressCachedBp = 10000`). */
export type ProjectCompletedEvent = ProjectLifecycleEventBase;

/** El proyecto dejó de estar al 100 %: bajó su avance o fue borrado. */
export interface ProjectReopenedEvent extends ProjectLifecycleEventBase {
  reason: 'progress_dropped' | 'deleted';
}
