/** Profundidad máxima del árbol de unidades (raíz central = nivel 1). SPEC §3.1 / ADR-0009. */
export const MAX_ORG_UNIT_DEPTH = 4;

export type OrgUnitKindValue = 'central' | 'ministry' | 'area';

export interface OrgUnitNode {
  id: string;
  parentId: string | null;
}

export interface OrgUnitKindNode extends OrgUnitNode {
  kind: string;
}

/**
 * Jerarquía de kinds (decisión de producto): `central` solo es raíz;
 * central -> ministry | area; ministry -> ministry | area; area -> area.
 */
const ALLOWED_CHILD_KINDS: Readonly<Record<OrgUnitKindValue, readonly OrgUnitKindValue[]>> = {
  central: ['ministry', 'area'],
  ministry: ['ministry', 'area'],
  area: ['area'],
};

/** true si una unidad de `childKind` puede colgar de una de `parentKind`. */
export function canBeChildOf(parentKind: string, childKind: string): boolean {
  const allowed = (ALLOWED_CHILD_KINDS as Record<string, readonly string[] | undefined>)[parentKind];
  return allowed?.includes(childKind) ?? false;
}

export type OrgUnitIndex = ReadonlyMap<string, OrgUnitNode>;

export function indexUnits<T extends OrgUnitNode>(units: readonly T[]): ReadonlyMap<string, T> {
  return new Map(units.map((u) => [u.id, u]));
}

/** Nivel de la unidad en el árbol (raíz = 1). Tolera datos corruptos cortando ciclos. */
export function depthOf(index: OrgUnitIndex, id: string): number {
  let depth = 0;
  let current: string | null = id;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = index.get(current)?.parentId ?? null;
  }
  return depth;
}

/** Cantidad de niveles del subárbol que cuelga de `id`, incluida la propia unidad (hoja = 1). */
export function subtreeHeight(units: readonly OrgUnitNode[], id: string): number {
  const childrenOf = new Map<string, string[]>();
  for (const u of units) {
    if (u.parentId !== null) {
      childrenOf.set(u.parentId, [...(childrenOf.get(u.parentId) ?? []), u.id]);
    }
  }
  const walk = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 0;
    seen.add(nodeId);
    let max = 0;
    for (const child of childrenOf.get(nodeId) ?? []) {
      max = Math.max(max, walk(child, seen));
    }
    return max + 1;
  };
  return walk(id, new Set());
}

/** true si `candidateId` es `ancestorId` o un descendiente suyo (mover `ancestorId` bajo `candidateId` crearía un ciclo). */
export function isSelfOrDescendant(index: OrgUnitIndex, ancestorId: string, candidateId: string): boolean {
  let current: string | null = candidateId;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = index.get(current)?.parentId ?? null;
  }
  return false;
}
