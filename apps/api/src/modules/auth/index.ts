// Public API of the auth module.
// Other modules MUST only import from this file, never from internal paths.

export { AuthModule } from './auth.module.js';
export { PrismaService } from './prisma/prisma.service.js';
export { tenantContextStorage } from './context/tenant-context-storage.js';
export { AuthGuard } from './guards/auth.guard.js';
export { TenantGuard } from './guards/tenant.guard.js';
export { PermissionsGuard } from './guards/permissions.guard.js';
export { SuperadminOnlyGuard } from './guards/superadmin-only.guard.js';
export { Public } from './decorators/public.decorator.js';
export { CurrentUser } from './decorators/current-user.decorator.js';
export { Permissions, PERMISSIONS_KEY } from './decorators/permissions.decorator.js';
export { SuperadminOnly } from './decorators/superadmin-only.decorator.js';
