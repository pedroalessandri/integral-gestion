import type { OrgUnitKind } from '@gestion-publica/shared-types/core';

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
