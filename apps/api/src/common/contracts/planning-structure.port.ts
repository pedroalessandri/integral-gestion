/**
 * Puertos de lectura de la estructura del árbol de planificación (ADR-0009 D5, regla 15 de CLAUDE.md).
 *
 * `metrics` arma el árbol de planificación (unidades y ejes) sin importar `core` ni `planning`. Los implementan sus
 * módulos dueños (solo lectura, dependen únicamente de PrismaService) y filtran siempre por organizationId.
 */

/** Unidad vista desde el árbol de planificación. */
export interface OrgUnitTreeRow {
  id: string;
  parentId: string | null;
  kind: 'central' | 'ministry' | 'area';
  name: string;
  order: number;
}

/** Implementa `core` (dueño de `core.org_unit`). */
export interface OrgUnitTreeReader {
  /** Todas las unidades vivas de la organización, sin orden garantizado. */
  listLiveOrgUnits(organizationId: string): Promise<OrgUnitTreeRow[]>;
}

export const ORG_UNIT_TREE_READER = Symbol('ORG_UNIT_TREE_READER');

export interface AxisTreeRow {
  id: string;
  name: string;
  order: number;
}

export interface ActivePlanStructure {
  id: string;
  title: string;
  axes: AxisTreeRow[];
}

/** Implementa `planning` (dueño de `planning.strategic_plan` y `planning.axis`). */
export interface AxisTreeReader {
  /** Plan activo de la organización con sus ejes vivos, o `null` si no hay plan activo. */
  findActivePlanStructure(organizationId: string): Promise<ActivePlanStructure | null>;
}

export const AXIS_TREE_READER = Symbol('AXIS_TREE_READER');
