// Public API of the core module.
// Other modules MUST only import from this file, never from internal paths.

export { CoreModule } from './core.module.js';
export { OrganizationContextService, MissingTenantContextError } from './services/organization-context.service.js';
export { PeriodService } from './services/period.service.js';
export { MemberService } from './services/member.service.js';
export { ModuleEnablementService } from './services/module-enablement.service.js';
export { UserSyncService } from './services/user-sync.service.js';
export type { JwtPayload, SyncedUser } from './services/user-sync.service.js';
