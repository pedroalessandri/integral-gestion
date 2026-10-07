export interface ObjectiveAssignment {
  orgUnitId: string | null;
  axisId: string | null;
}

/**
 * Campos de unidad/eje a enviar en create. Se omiten si están vacíos (la unidad es nullable hasta
 * la fase migrate, ADR-0009 D6; el eje es opcional, RN-P2).
 */
export function assignmentForCreate(current: ObjectiveAssignment): { orgUnitId?: string; axisId?: string } {
  return {
    ...(current.orgUnitId && { orgUnitId: current.orgUnitId }),
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
