export type OrgUnitKind = 'central' | 'ministry' | 'area';

/** Unidad de gobierno (N3, ADR-0009). */
export interface OrgUnitDto {
  id: string;
  organizationId: string;
  parentId: string | null;
  kind: OrgUnitKind;
  name: string;
  vision: string | null;
  mission: string | null;
  order: number;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** Nodo del árbol (GET /orgs/:orgId/org-units/tree). */
export interface OrgUnitTreeNodeDto extends OrgUnitDto {
  children: OrgUnitTreeNodeDto[];
}

/** POST /api/v1/orgs/:orgId/org-units. La raíz central no se crea por API (RN-P1). */
export interface CreateOrgUnitDto {
  parentId: string;
  kind: Exclude<OrgUnitKind, 'central'>;
  name: string;
  vision?: string | null;
  mission?: string | null;
  order?: number;
}

/** PATCH /api/v1/orgs/:orgId/org-units/:id. `parentId` mueve el subárbol. */
export interface UpdateOrgUnitDto {
  name?: string;
  kind?: Exclude<OrgUnitKind, 'central'>;
  parentId?: string;
  vision?: string | null;
  mission?: string | null;
  order?: number;
}
