export type StrategicPlanStatus = 'active' | 'archived';

/** Plan de gobierno vigente (N1, ADR-0009). Un solo plan `active` por organización (RN-P2). */
export interface StrategicPlanDto {
  id: string;
  organizationId: string;
  title: string;
  /** Visión general de gobierno. */
  vision: string;
  /** ISO-8601 UTC. Inicio del mandato. */
  mandateStartsAt: string;
  /** ISO-8601 UTC. Fin del mandato (posterior al inicio). */
  mandateEndsAt: string;
  status: StrategicPlanStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/**
 * PUT /api/v1/orgs/:orgId/strategic-plan. Crea el plan activo o reemplaza sus campos (upsert).
 * Requiere el permiso `planning:plan:manage`. 422 `MandateRangeInvalid` si el fin no es posterior al inicio.
 */
export interface UpsertStrategicPlanDto {
  title: string;
  vision: string;
  /** ISO-8601. */
  mandateStartsAt: string;
  /** ISO-8601. */
  mandateEndsAt: string;
}
