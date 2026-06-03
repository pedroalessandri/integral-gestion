/**
 * Response body for GET /api/v1/me.
 *
 * Shape finalized in ADR 0002 (extends the shape assumed by ADR 0001).
 * Gives the frontend everything needed to decide which screens to render
 * without additional roundtrips.
 */
export interface MeDto {
  userId: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  orgs: Array<{
    id: string;
    slug: string;
    name: string;
    role: {
      /** e.g. 'org-admin', 'org-user', 'org-reader'. */
      key: string;
      name: string;
      /** e.g. ['okr:read', 'okr:write', 'core:period:manage']. Superadmin carries ['*']. */
      permissions: string[];
    };
    /** e.g. ['okr']. */
    enabledModules: string[];
  }>;
}
