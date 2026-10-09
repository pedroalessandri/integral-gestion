export interface ObjectiveAssignment {
  orgUnitId: string | null;
  axisId: string | null;
}

/** Un objetivo siempre pertenece a una unidad (RN-P3): sin unidad no se puede crear. */
export function hasUnit(current: ObjectiveAssignment): current is { orgUnitId: string; axisId: string | null } {
  return current.orgUnitId !== null && current.orgUnitId !== '';
}

/** Campos de unidad/eje a enviar en create. La unidad es obligatoria; el eje se omite si está vacío (RN-P2). */
export function assignmentForCreate(current: { orgUnitId: string; axisId: string | null }): {
  orgUnitId: string;
  axisId?: string;
} {
  return {
    orgUnitId: current.orgUnitId,
    ...(current.axisId && { axisId: current.axisId }),
  };
}

/**
 * Campos a enviar en update: solo los que cambiaron. La API no permite dejar el objetivo sin unidad
 * (`orgUnitId` no acepta null) pero sí quitar el eje con `axisId: null`.
 */
export function assignmentForUpdate(
  initial: ObjectiveAssignment,
  current: ObjectiveAssignment,
): { orgUnitId?: string; axisId?: string | null } {
  return {
    ...(current.orgUnitId && current.orgUnitId !== initial.orgUnitId && { orgUnitId: current.orgUnitId }),
    ...(current.axisId !== initial.axisId && { axisId: current.axisId }),
  };
}
