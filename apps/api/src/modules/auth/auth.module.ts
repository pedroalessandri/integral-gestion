import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { TenantGuard } from './guards/tenant.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { SuperadminOnlyGuard } from './guards/superadmin-only.guard.js';
import { RolesController, PermissionsController } from './auth.controller.js';

/**
 * AuthModule is @Global so PrismaService is available to all modules without
 * each having to import AuthModule explicitly. This is intentional: Prisma is
 * a foundational infrastructure dependency, not a feature-level one.
 *
 * Exports: PrismaService (and tenantContextStorage via index.ts for non-DI consumers).
 *
 * Guards are registered as providers so they can be injected where needed,
 * but are NOT registered as APP_GUARD — they are applied per-controller/handler.
 *
 * Controllers: RolesController and PermissionsController expose read-only catalog
 * endpoints per ADR 0004 D8 (GET /api/v1/roles/*, GET /api/v1/permissions/*).
 */
@Global()
@Module({
  controllers: [RolesController, PermissionsController],
  providers: [PrismaService, TenantGuard, PermissionsGuard, SuperadminOnlyGuard],
  exports: [PrismaService, TenantGuard, PermissionsGuard, SuperadminOnlyGuard],
})
export class AuthModule {}
