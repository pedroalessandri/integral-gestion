/** Eje (N2, ADR-0009): agrupa objetivos de una o más unidades. Pertenece al plan activo. */
export interface AxisDto {
  id: string;
  organizationId: string;
  strategicPlanId: string;
  name: string;
  description: string | null;
  order: number;
  /** Objetivos vivos asignados al eje. La UI lo usa para el warning previo a borrar (se desasignan). */
  objectiveCount: number;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** POST /api/v1/orgs/:orgId/strategic-plan/axes. 422 `StrategicPlanRequired` si no hay plan activo. */
export interface CreateAxisDto {
  name: string;
  description?: string | null;
  order?: number;
}

/** PATCH /api/v1/orgs/:orgId/strategic-plan/axes/:id. */
export interface UpdateAxisDto {
  name?: string;
  description?: string | null;
  order?: number;
}

/**
 * Respuesta de DELETE /api/v1/orgs/:orgId/strategic-plan/axes/:id (200).
 * Borrar un eje con objetivos los deja sin eje (`axisId = null`); acá vienen los afectados.
 */
export interface DeleteAxisResultDto {
  unassignedObjectiveCount: number;
  unassignedObjectiveIds: string[];
}
