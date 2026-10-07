import type { ApiErrorInfo } from '@/lib/api-errors';

/** Mensajes en español para los 409/422 tipados de Estructura, Plan y asignación de objetivos. */
const MESSAGES: Record<string, string> = {
  OrgUnitMaxDepthExceeded:
    'El árbol no puede tener más de 4 niveles. Elegí una unidad padre de un nivel más alto.',
  OrgUnitInvalidParentKind:
    'Ese tipo de unidad no puede depender de la unidad padre elegida. Una unidad central o un ministerio admiten ministerios y áreas; un área solo admite áreas.',
  OrgUnitCycle: 'No podés mover una unidad dentro de sí misma ni de una de sus unidades dependientes.',
  CentralRootImmutable: 'La unidad central no se puede mover, cambiar de tipo ni borrar.',
  OrgUnitHasChildren: 'La unidad tiene unidades dependientes. Borralas o movelas antes de eliminarla.',
  OrgUnitHasObjectives:
    'La unidad tiene objetivos estratégicos asignados. Reasignalos a otra unidad antes de eliminarla.',
  OrgUnitHasMembers:
    'La unidad tiene miembros con alcance asignado. Reasignales el alcance antes de eliminarla.',
  OrgUnitNotFound: 'La unidad elegida no existe en esta organización.',
  OrgUnitKindInvalid:
    'Un objetivo solo se puede asignar a un ministerio/secretaría o a un área/dirección, no a la unidad central.',
  AxisNotInActivePlan: 'El eje elegido no pertenece al plan de gobierno vigente.',
  StrategicPlanRequired: 'Primero tenés que crear el plan de gobierno para poder agregar ejes.',
  StrategicPlanNotFound: 'La organización todavía no tiene un plan de gobierno.',
  StrategicPlanConflict: 'Otra persona creó el plan al mismo tiempo. Recargá la página e intentá de nuevo.',
  MandateRangeInvalid: 'El fin del mandato tiene que ser posterior al inicio.',
};

export function describeApiError(info: ApiErrorInfo): string {
  if (info.code && MESSAGES[info.code]) return MESSAGES[info.code] as string;
  if (info.status === 403) return 'No tenés permisos para realizar esta acción.';
  if (info.status === 404) return 'No se encontró el recurso. Puede que lo hayan eliminado; recargá la página.';
  if (info.status === 400 && info.message) return `Revisá los datos: ${info.message}`;
  if (info.status >= 500) return 'Ocurrió un error inesperado. Intentá de nuevo en unos minutos.';
  return info.message || `No se pudo completar la acción (HTTP ${info.status}).`;
}

export interface ActionFailure {
  ok: false;
  error: string;
  /** Código de dominio (p. ej. `OrgUnitHasMembers`) para que el hook decida comportamientos especiales. */
  code: string | null;
  status: number;
}

export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure;

export function failure(info: ApiErrorInfo): ActionFailure {
  return { ok: false, error: describeApiError(info), code: info.code, status: info.status };
}

export function unexpectedFailure(err: unknown): ActionFailure {
  return {
    ok: false,
    error: err instanceof Error && err.message === 'No session'
      ? 'Tu sesión expiró. Volvé a iniciar sesión.'
      : 'No pudimos conectar con el servidor. Intentá de nuevo.',
    code: null,
    status: 0,
  };
}
