import type { MemberDto, OrgUnitKind, OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';

/**
 * Espejo de UI de las reglas del backend (RN-P1, ADR-0009). La fuente de verdad es la API
 * (devuelve 422 si no se cumplen); estos helpers solo evitan ofrecer opciones inválidas.
 */
export const MAX_ORG_UNIT_DEPTH = 4;

export type EditableKind = Exclude<OrgUnitKind, 'central'>;

export function allowedChildKinds(parentKind: OrgUnitKind): EditableKind[] {
  if (parentKind === 'area') return ['area'];
  return ['ministry', 'area'];
}

export interface FlatUnit {
  node: OrgUnitTreeNodeDto;
  /** Raíz central = 1. */
  depth: number;
}

export function flattenTree(nodes: OrgUnitTreeNodeDto[], depth = 1): FlatUnit[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenTree(node.children, depth + 1)]);
}

export function findUnit(tree: OrgUnitTreeNodeDto[], id: string): FlatUnit | null {
  return flattenTree(tree).find((u) => u.node.id === id) ?? null;
}

export function descendantIds(node: OrgUnitTreeNodeDto): Set<string> {
  return new Set(flattenTree(node.children).map((u) => u.node.id));
}

/** Unidades donde puede colgar un objetivo (RN-P3): solo ministry | area. */
export function assignableUnits(tree: OrgUnitTreeNodeDto[]): FlatUnit[] {
  return flattenTree(tree).filter((u) => u.node.kind !== 'central');
}

export function canAddChild(unit: FlatUnit): boolean {
  return unit.depth < MAX_ORG_UNIT_DEPTH;
}

/** Padres posibles al mover `unit`: cualquier unidad que no sea ella ni sus dependientes y que admita su tipo. */
export function candidateParents(tree: OrgUnitTreeNodeDto[], unit: OrgUnitTreeNodeDto): FlatUnit[] {
  const excluded = descendantIds(unit);
  excluded.add(unit.id);
  return flattenTree(tree).filter(
    (u) =>
      !excluded.has(u.node.id) &&
      unit.kind !== 'central' &&
      allowedChildKinds(u.node.kind).includes(unit.kind as EditableKind) &&
      canAddChild(u),
  );
}

export function membersOfUnit(members: MemberDto[], unitId: string): MemberDto[] {
  return members.filter((m) => m.orgUnitId === unitId);
}
