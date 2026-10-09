/** Request body for POST /api/v1/okr/objectives. Period is resolved server-side to the current open period (RN-24). */
export interface CreateObjectiveDto {
  title: string;
  description?: string;
  /** Optional owner userId. When omitted, defaults server-side to the requesting user. */
  ownerUserId?: string | null;
  /** Unidad de tipo `ministry` o `area` de la misma org (RN-P3). Obligatoria. 422 `OrgUnitNotFound` / `OrgUnitKindInvalid`. */
  orgUnitId: string;
  /** Eje del plan activo de la misma org (RN-P2). 422 `AxisNotInActivePlan`. */
  axisId?: string;
}

/** Request body for PATCH /api/v1/okr/objectives/:id. Only title/description; weight does not apply to Objectives (RN-11). */
export interface UpdateObjectiveDto {
  title?: string;
  description?: string | null;
  /** Pass a userId to assign owner, explicit null to unassign, omit to leave unchanged. */
  ownerUserId?: string | null;
  /** Cambia la unidad (mismas validaciones que en create). No se puede dejar sin unidad una vez asignada. */
  orgUnitId?: string;
  /** Cambia el eje; `null` lo quita; omitido lo deja igual. */
  axisId?: string | null;
}
