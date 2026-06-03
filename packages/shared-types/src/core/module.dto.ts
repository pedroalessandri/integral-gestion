export interface ModuleDto {
  key: string;
  name: string;
  description: string | null;
}

export interface OrganizationModuleDto {
  organizationId: string;
  moduleKey: string;
  moduleName: string;
  /** ISO-8601 UTC. */
  enabledAt: string;
  /** ISO-8601 UTC. Null means currently enabled. */
  disabledAt: string | null;
}
