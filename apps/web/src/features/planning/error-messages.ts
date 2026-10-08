import type { LinkedProjectRefDto } from '@gestion-publica/shared-types/metrics';
import type { ApiErrorInfo } from '@/lib/api-errors';
import { CONTRIBUTION_ERROR_MESSAGES, LINKED_PROJECT_LINK_LABELS } from '@/lib/labels';

/** Mensajes en español para los 409/422 tipados de Estructura, Plan y asignación de objetivos. */
const MESSAGES: Record<string, string> = {
  OrgUnitScopeForbidden:
    'Tu alcance no incluye esta unidad: podés ver toda la organización, pero solo editar en tu unidad y las que dependen de ella.',
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
  ObjectiveWithoutOrgUnit:
    'El objetivo todavía no tiene unidad. Editalo y asignale un ministerio o un área para poder cargar proyectos.',
  ProjectOrgUnitOutOfScope:
    'La unidad del proyecto tiene que ser la del objetivo o una unidad dependiente de ella.',
  ProjectProgressModeNotSupported:
    'Por ahora el avance del proyecto solo se calcula desde sus tareas.',
  ProjectDatesInvalid: 'La fecha de inicio del proyecto tiene que ser anterior o igual a la de fin.',
  ProjectOutsidePeriod: 'Las fechas del proyecto tienen que estar dentro del período del objetivo.',
  TaskDatesInvalid: 'La fecha de inicio de la tarea tiene que ser anterior o igual a la de fin.',
  TaskOutsideProject: 'Las fechas de la tarea tienen que estar dentro de las fechas del proyecto.',
  WeightSumInvalid:
    'Los pesos del grupo tienen que sumar 100 %. Redistribuilos con "Editar pesos" y volvé a intentar.',
  MixedWeightGroup:
    'En un grupo, o todos los elementos tienen peso o ninguno. Usá "Ponderar" para asignarlos todos juntos.',
  MetricKindChangeBlocked:
    'No podés pasar el indicador de Producto a Resultado porque tiene proyectos que le aportan. Quitá primero esos aportes.',
  LinkModeRequiresOutputMetric:
    'Solo los indicadores de tipo Producto pueden recibir aportes de proyectos.',
  IndicatorDirectionMismatch:
    'La dirección no coincide con la meta: un indicador creciente necesita una meta mayor que la línea base y uno decreciente, una menor.',
  IndicatorBaselineEqualsTarget: 'La línea base y la meta no pueden ser iguales.',
  IndicatorTargetRequired: 'Con una métrica nueva tenés que indicar la meta y la dirección.',
  IndicatorMetricSourceInvalid: 'Elegí una métrica existente o completá los datos de una nueva, pero no las dos cosas.',
  IndicatorPeriodMismatch: 'La métrica tiene que ser del mismo período que el objetivo.',
  IndicatorAlreadyLinked: 'Esa métrica ya es un indicador de este objetivo.',
  MetricInUseByObjective:
    'No se puede eliminar el indicador porque mide un objetivo. Quitalo primero de los objetivos.',
  InvalidBucketDate: 'Esa fecha no es un inicio de intervalo válido para la frecuencia del indicador. Elegí otra.',
  IndicatorTargetPointsInvalid:
    'Los puntos de la curva manual no son válidos. Cada punto tiene que caer en el inicio de un intervalo del período y el último tiene que ser igual a la meta.',
  ...CONTRIBUTION_ERROR_MESSAGES,
  OwnerNotMember: 'La persona responsable tiene que ser miembro de la organización.',
  MandateRangeInvalid: 'El fin del mandato tiene que ser posterior al inicio.',
};

/** Códigos cuyo detalle (qué punto falló y por qué) vale la pena mostrar junto al mensaje fijo. */
const CODES_WITH_DETAIL = new Set(['IndicatorTargetPointsInvalid']);

/** Proyectos de `details.projects` del 422 `IndicatorHasLinkedProjects`, descartando lo que no tenga la forma esperada. */
export function linkedProjectsFromDetails(details: Record<string, unknown> | undefined): LinkedProjectRefDto[] {
  const raw = details?.projects;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p): LinkedProjectRefDto[] => {
    if (typeof p !== 'object' || p === null) return [];
    const { id, title, link } = p as Record<string, unknown>;
    if (typeof id !== 'string' || typeof title !== 'string') return [];
    return [{ id, title, link: link === 'source_indicator' ? 'source_indicator' : 'contribution' }];
  });
}

export function describeApiError(info: ApiErrorInfo): string {
  if (info.code === 'IndicatorHasLinkedProjects') {
    const fixed = MESSAGES.IndicatorHasLinkedProjects as string;
    const projects = linkedProjectsFromDetails(info.details);
    if (projects.length === 0) return fixed;
    const list = projects.map((p) => `"${p.title}" (${LINKED_PROJECT_LINK_LABELS[p.link]})`).join(', ');
    return `${fixed} Proyectos vinculados: ${list}.`;
  }
  if (info.code && MESSAGES[info.code]) {
    const fixed = MESSAGES[info.code] as string;
    return CODES_WITH_DETAIL.has(info.code) && info.message ? `${fixed} Detalle: ${info.message}` : fixed;
  }
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
