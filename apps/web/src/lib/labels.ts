import type { OrgUnitKind } from '@gestion-publica/shared-types/core';
import type { ExpectedCurveMode, MetricKind, SemaphoreColor } from '@gestion-publica/shared-types/metrics';

/**
 * Diccionario único de etiquetas de UI (ADR-0006 D2, SPEC §5).
 * La UI usa los términos de planificación de gobierno; el código mantiene los nombres
 * técnicos (ADR-0009 D1). Ver glosario UI ↔ código en CLAUDE.md.
 */
export const LABELS = {
  plan: { singular: 'Plan de gobierno', vision: 'Visión general de gobierno' },
  axis: { singular: 'Eje', plural: 'Ejes' },
  unit: { singular: 'Unidad', plural: 'Unidades', structure: 'Estructura' },
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
  keyResultsShort: 'Resultados Clave',
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
    hint: 'Sube cuando termina cada proyecto que aporta al indicador. Todavía no está disponible: depende de los aportes de proyectos.',
  },
};
