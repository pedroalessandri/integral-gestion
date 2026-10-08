export interface MemberDto {
  userId: string;
  email: string;
  displayName: string;
  role: {
    id: string;
    key: string;
    name: string;
  };
  /** ISO-8601 UTC. */
  assignedAt: string;
  /**
   * true when the user was created via invite-by-email and has not yet logged
   * in (auth0Sub starts with "pending:").
   */
  isPending: boolean;
  /** Alcance de escritura (RN-P19/P20). null = toda la org (unidad central). */
  orgUnitId: string | null;
}

/** Request body for PATCH /api/v1/orgs/:orgId/members/:userId/scope. */
export interface SetMemberScopeDto {
  /** null = alcance toda la org (unidad central). */
  orgUnitId: string | null;
}

/** Request body for POST /api/v1/orgs/:orgId/members — invite by email. */
export interface InviteMemberDto {
  email: string;
  /** One of: org-admin, org-user, org-reader */
  roleKey: string;
  /**
   * Alcance de escritura inicial (RN-P19/P20). Opcional: sin él, el miembro queda con alcance null (toda la org).
   * Debe ser una unidad viva de la org.
   */
  orgUnitId?: string | null;
}

/** Request body for PATCH /api/v1/orgs/:orgId/members/:userId — change role. */
export interface ChangeMemberRoleDto {
  /** One of: org-admin, org-user, org-reader */
  roleKey: string;
}

/** Query string for GET /api/v1/orgs/:orgId/members. */
export interface ListMembersQueryDto {
  roleKey?: string;
  search?: string;
}

/** @deprecated Use InviteMemberDto */
export interface AssignMemberDto {
  email: string;
  roleKey: string;
}

/** @deprecated Use ChangeMemberRoleDto */
export interface UpdateMemberDto {
  roleKey: string;
}
