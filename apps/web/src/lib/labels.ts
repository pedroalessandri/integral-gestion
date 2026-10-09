import type { OrgUnitKind } from '@gestion-publica/shared-types/core';
import type {
  ExpectedCurveMode,
  MetricKind,
  ObjectiveIndicatorLinkMode,
  SemaphoreColor,
} from '@gestion-publica/shared-types/metrics';

/**
 * Diccionario único de etiquetas de UI (ADR-0006 D2, SPEC §5).
 * La UI usa los términos de planificación de gobierno; el código mantiene los nombres
 * técnicos (ADR-0009 D1). Ver glosario UI ↔ código en CLAUDE.md.
 */
export const LABELS = {
  plan: { singular: 'Plan de gobierno', vision: 'Visión general de gobierno' },
  planningTree: 'Árbol de planificación',
  axis: { singular: 'Eje', plural: 'Ejes' },
  unit: {
    singular: 'Unidad',
    plural: 'Unidades',
    structure: 'Estructura',
    choose: 'Elegí la unidad',
    required: 'Elegí la unidad del objetivo.',
  },
  vision: 'Visión',
  mission: 'Misión',
  objective: { singular: 'Objetivo estratégico', plural: 'Objetivos estratégicos' },
  indicator: { singular: 'Indicador', plural: 'Indicadores' },
  indicatorEntry: 'Carga de indicador',
  expectedCurve: 'Curva esperada',
  contextIndicator: 'Indicador de contexto',
  project: { singular: 'Proyecto', plural: 'Proyectos' },
  task: { singular: 'Tarea', plural: 'Tareas' },
  projectContribution: 'Aporte de proyecto a indicador',
  resultProgress: 'Avance de resultado',
  executionProgress: 'Avance de gestión',
  period: { singular: 'Período', plural: 'Períodos' },
  planningModule: 'Módulo de planificación',
  member: { singular: 'Miembro', plural: 'Miembros' },
  scope: 'Alcance',
  context: 'Contexto',
  weighting: {
    toggle: 'Ponderar',
    editWeights: 'Editar pesos',
    weight: 'Peso',
    unweighted: 'Sin pesos (promedio simple)',
  },
} as const;

export const ORG_UNIT_KIND_LABELS: Record<OrgUnitKind, string> = {
  central: 'Central',
  ministry: 'Ministerio / Secretaría',
  area: 'Área / Dirección',
};

/** Alcance null = toda la organización (unidad central, RN-P19). */
export const SCOPE_WHOLE_ORG_LABEL = 'Toda la organización';

/** Opción del selector de eje cuando el objetivo no tiene eje (RN-P2). */
export const NO_AXIS_LABEL = 'Sin eje';

/** Tipo de indicador (RN-P12): producto admite aportes de proyectos; resultado se carga a mano. */
export const INDICATOR_KIND_LABELS: Record<MetricKind, { label: string; hint: string }> = {
  output: { label: 'Producto', hint: 'lo que se entrega (km, obras, cantidad)' },
  outcome: { label: 'Resultado', hint: 'el cambio que se busca (alfabetización, calidad)' },
};

/** Semáforo del desvío contra lo esperado (RN-P9). Adelantado cuenta como "En tiempo". */
export const SEMAPHORE_LABELS: Record<SemaphoreColor, string> = {
  green: 'En tiempo',
  yellow: 'Atención',
  red: 'Atrasado',
};

export const DEVIATION_LABELS = {
  deviation: 'Desvío',
  noData: 'Sin datos',
  noDataHint: 'Todavía no hay cargas para medir el desvío contra lo esperado.',
} as const;

/** Carga vencida (RN-P15): buckets cerrados hace más de N días sin carga. */
export const PENDING_LOAD_LABELS = {
  one: 'Carga pendiente',
  many: (count: number) => `${count} cargas pendientes`,
  hint: 'Intervalos ya cerrados que todavía no tienen carga.',
} as const;

/** Modo de la curva esperada del indicador (RN-P17). */
export const EXPECTED_CURVE_MODE_LABELS: Record<ExpectedCurveMode, { label: string; hint: string }> = {
  linear: { label: 'Lineal', hint: 'Va en línea recta desde la línea base hasta la meta a lo largo del período.' },
  manual: {
    label: 'Manual',
    hint: 'Definís cuánto esperás acumular en cada intervalo. Los intervalos sin valor se interpolan.',
  },
  from_projects: {
    label: 'Desde proyectos',
    hint: 'Sube cuando termina cada proyecto que aporta al indicador, en la fecha de fin planificada del proyecto.',
  },
};

/** Por qué no se puede elegir la curva "Desde proyectos" (RN-P17: solo `output` + `execution_feeds_indicator`). */
export const FROM_PROJECTS_UNAVAILABLE_LABELS = {
  notOutput: 'Solo los indicadores de tipo Producto pueden usar la curva "Desde proyectos".',
  notLinked:
    'Para usar la curva "Desde proyectos", el vínculo con la gestión tiene que ser "Los proyectos aportan al indicador".',
} as const;

/** Vínculo del indicador con la gestión (RN-P14b). */
export const LINK_MODE_LABELS: Record<ObjectiveIndicatorLinkMode, { label: string; hint: string }> = {
  independent: { label: 'Independiente', hint: 'El indicador se carga a mano y no depende de proyectos.' },
  execution_feeds_indicator: {
    label: 'Los proyectos aportan al indicador',
    hint: 'Cada proyecto con aporte suma su valor al indicador cuando llega al 100 %. Solo para indicadores de tipo Producto.',
  },
  indicator_feeds_execution: {
    label: 'El indicador alimenta a un proyecto',
    hint: 'Un proyecto toma su avance de este indicador. Se configura desde el proyecto.',
  },
};

export const LINK_MODE_FIELD_LABELS = {
  legend: 'Vínculo con la gestión',
  outputOnly: 'Solo disponible para indicadores de tipo Producto.',
} as const;

/** Por qué un proyecto está vinculado a un indicador (422 `IndicatorHasLinkedProjects`). */
export const LINKED_PROJECT_LINK_LABELS: Record<'contribution' | 'source_indicator', string> = {
  contribution: 'aporta al indicador',
  source_indicator: 'toma su avance del indicador',
};

/** Aportes de proyectos a indicadores (RN-P12, RN-P13, RN-P14). */
export const CONTRIBUTION_LABELS = {
  section: 'Aporta a indicador',
  sectionHint:
    'Cuando este proyecto llegue al 100 %, el valor del aporte se suma automáticamente al indicador elegido.',
  add: 'Agregar aporte',
  indicator: 'Indicador',
  value: 'Valor del aporte',
  valueHelp: 'Cuánto suma al indicador cuando el proyecto llega al 100 %. Puede ser cualquier valor distinto de cero.',
  applied: 'Aplicado',
  pending: 'Pendiente',
  appliedHint: 'El proyecto llegó al 100 % y el aporte ya se sumó al indicador.',
  pendingHint: (progress: string) => `El proyecto está al ${progress}. Se aplica cuando llegue al 100 %.`,
  lockedHint:
    'Un aporte aplicado no se puede editar ni quitar mientras el proyecto esté al 100 %. Si el proyecto vuelve a bajar del 100 %, el aporte se revierte y se puede modificar.',
  lockedEdit: 'No se puede editar: el aporte ya está aplicado.',
  lockedRemove: 'No se puede quitar: el aporte ya está aplicado.',
  empty: 'Este proyecto todavía no aporta a ningún indicador.',
  emptyCta: 'Agregá un aporte para que sume al indicador cuando se complete.',
  noEligibleTitle: 'No hay indicadores a los que este proyecto pueda aportar',
  noEligible:
    'Un proyecto solo puede aportar a indicadores de su mismo objetivo que sean de tipo Producto y tengan el vínculo "Los proyectos aportan al indicador". Editá un indicador del objetivo para habilitarlo.',
  allUsed: 'Este proyecto ya aporta a todos los indicadores elegibles del objetivo.',
  addTitle: 'Agregar aporte a un indicador',
  editTitle: 'Editar aporte',
  remove: 'Quitar aporte',
  removeTitle: '¿Quitar este aporte?',
  removeDescription: (indicator: string) =>
    `El proyecto dejará de aportar a "${indicator}". Si todavía no se había aplicado, el indicador no cambia.`,
  loadError: 'No pudimos cargar los aportes del proyecto.',
  invalidValue: 'Ingresá un número distinto de cero (hasta 4 decimales).',
} as const;

/** Distinción de las cargas automáticas en el historial del indicador (RN-P14). */
export const AUTOMATIC_ENTRY_LABELS = {
  badge: 'Automática',
  from: (project: string) => `Aporte del proyecto "${project}"`,
  fromUnknown: 'Aporte de un proyecto',
  readOnly: 'Carga automática: no se puede editar ni eliminar.',
  compensation: 'Compensación',
  compensationHint: 'Revierte un aporte porque el proyecto bajó del 100 %.',
} as const;

/** Aviso cuando los aportes no alcanzan la meta (RN-P17). */
export const CONTRIBUTION_SHORTFALL_LABELS = {
  title: 'Los aportes no alcanzan la meta',
  body: (projected: string, target: string, count: number) =>
    `Con ${count === 1 ? 'el aporte' : `los ${count} aportes`} de los proyectos el indicador llegaría a ${projected}, y la meta es ${target}. Sumá aportes o revisá la meta.`,
  noContributions: (target: string) =>
    `Todavía ningún proyecto aporta a este indicador, así que no llegaría a la meta (${target}). Agregá aportes desde la ficha de cada proyecto.`,
  total: 'Total de aportes',
  projected: 'Valor proyectado',
  target: 'Meta',
} as const;

/** Mensajes de los 409/422 de aportes y de vínculos (C17). */
export const CONTRIBUTION_ERROR_MESSAGES: Record<string, string> = {
  ContributionRequiresOutputMetric:
    'Solo los indicadores de tipo Producto pueden recibir aportes de proyectos.',
  ContributionRequiresExecutionFeedsMode:
    'El indicador no tiene el vínculo "Los proyectos aportan al indicador". Editalo para habilitar los aportes.',
  ContributionProjectNotFound: 'El proyecto no existe o fue eliminado. Recargá la página.',
  ContributionProjectObjectiveMismatch: 'El proyecto y el indicador tienen que ser del mismo objetivo.',
  ContributionProjectFeedsFromIndicator:
    'Este proyecto toma su avance de ese indicador, así que no puede aportarle. Un proyecto y un indicador no pueden vincularse en los dos sentidos.',
  ContributionAlreadyApplied:
    'El aporte ya se aplicó al indicador porque el proyecto llegó al 100 %. No se puede editar ni quitar hasta que el proyecto baje del 100 %.',
  ContributionAlreadyExists: 'Este proyecto ya tiene un aporte a ese indicador. Editá el existente.',
  AutomaticEntryReadOnly:
    'Esa carga la generó un aporte de proyecto y es de solo lectura. Para cambiarla, modificá el avance del proyecto.',
  ExpectedCurveModeNotAvailable:
    'La curva "Desde proyectos" solo está disponible para indicadores de tipo Producto con el vínculo "Los proyectos aportan al indicador".',
  IndicatorHasLinkedProjects:
    'El indicador tiene proyectos vinculados vigentes. Desvinculalos primero (quitá sus aportes o cambiá la fuente del proyecto).',
};

/** Selector de unidad (alcance inicial) del formulario de invitación de miembros (RN-P19/P20). */
export const INVITE_SCOPE_LABELS = {
  field: 'Unidad (alcance de escritura)',
  placeholder: '— Elegí una unidad —',
  hint: 'Define dónde va a poder cargar y editar la persona invitada. Es obligatorio.',
  required: 'Elegí una unidad o "Toda la organización" para poder invitar.',
  forbidden:
    'No tenés alcance sobre esa unidad. Elegí una unidad dentro de tu alcance; "Toda la organización" solo está disponible para quienes tienen alcance total.',
  missing: 'Falta indicar la unidad de la persona invitada. Elegí una unidad o "Toda la organización".',
  loadError: 'No pudimos cargar las unidades. Cerrá y volvé a abrir el formulario.',
} as const;

/** Árbol de planificación y tableros (SPEC §5.2/§5.3, RN-P10). */
export const PLANNING_TREE_LABELS = {
  nav: 'Árbol de planificación',
  title: 'Árbol de planificación',
  subtitle: 'Cómo avanza el plan de gobierno, por eje o por unidad. El resultado y la gestión se leen por separado.',
  views: { legend: 'Vista', axes: 'Por ejes', units: 'Por unidades' },
  filters: {
    period: 'Período',
    axis: 'Eje',
    unit: 'Unidad',
    allAxes: 'Todos los ejes',
    allUnits: 'Todas las unidades',
    clear: 'Limpiar filtros',
    loading: 'Actualizando…',
  },
  readingShort: { result: 'Resultado', execution: 'Gestión' },
  expandAll: 'Expandir todo',
  collapseAll: 'Colapsar todo',
  expand: (name: string) => `Expandir ${name}`,
  collapse: (name: string) => `Colapsar ${name}`,
  withoutAxis: 'Sin eje',
  withoutUnit: 'Sin unidad',
  noPlan: 'Sin plan de gobierno activo',
  noPlanHint: 'Podés ver igual los objetivos del período por unidad. Creá el plan en Plan de gobierno para agruparlos por eje.',
  noObjectives: 'Sin objetivos',
  noObjectivesInAxis: 'Este eje todavía no tiene objetivos en el período.',
  emptyTitle: 'No hay objetivos en este período',
  emptyDescription: 'Cuando haya objetivos estratégicos en el período elegido, los vas a ver acá agrupados.',
  noPeriodTitle: 'No hay períodos para mostrar',
  noPeriodDescription: 'Para ver el árbol necesitás al menos un período. Pedile a un admin de la organización que cree uno.',
  loadError: 'No pudimos cargar el árbol de planificación.',
  openObjective: 'Ver ficha',
  objectivesCount: (n: number) => (n === 0 ? 'Sin objetivos' : n === 1 ? '1 objetivo' : `${n} objetivos`),
  noObjectivesReading: 'Sin objetivos',
  boardTitle: 'Avance por eje',
  boardSubtitle: (period: string) => `Período ${period}. Resultado y gestión por separado.`,
  boardNoPeriod: 'No hay un período abierto para calcular el avance por eje. Elegí un período para verlo.',
  boardLink: 'Ver el árbol completo',
  boardUnits: 'Por unidad',
  boardUnitsEmpty: 'Ninguna unidad tiene objetivos en este eje.',
} as const;

/** Vista ejecutiva (Gantt) Objetivo -> Proyecto -> Tarea (SPEC §5.7). */
export const EXECUTIVE_GANTT_LABELS = {
  title: 'Objetivos — Vista ejecutiva',
  subtitle: (period: string, range: string) => `Período ${period} · ${range}`,
  backToList: '← Volver a la lista',
  columnItem: 'Ítem',
  collapseAll: 'Colapsar',
  expandAll: 'Expandir',
  expandObjective: 'Expandir objetivo',
  collapseObjective: 'Colapsar objetivo',
  showTasks: 'Mostrar tareas',
  noProjects: 'Sin proyectos',
  noTasks: 'Sin tareas asignadas',
  fromIndicator: 'Avance del indicador',
  fromIndicatorHint: 'El avance de este proyecto viene del indicador; sus tareas son informativas.',
  informativeTask: 'Informativa',
  tasksInformativeNote: 'Tareas informativas: no suman al avance del proyecto.',
  noUnit: 'Sin unidad',
  noAxis: 'Sin eje',
  progress: 'Avance',
  openObjective: (title: string) => `Ver detalle de ${title}`,
  emptyTitle: 'Sin objetivos en este período',
  emptyDescription: 'No hay objetivos con estos filtros. Probá con otro eje o unidad, o creá objetivos en la lista.',
  emptyCta: 'Ir a lista de objetivos',
  noPeriodTitle: 'No hay un período para mostrar',
  noPeriodDescription: 'Para ver la vista ejecutiva necesitás un período abierto o cerrado. Pedile a un admin de la organización que cree uno.',
  loadError: 'No pudimos cargar la vista ejecutiva.',
  mobileHint: 'Esta vista está optimizada para pantallas grandes.',
  mobileLink: 'Ir a la lista estándar →',
} as const;
