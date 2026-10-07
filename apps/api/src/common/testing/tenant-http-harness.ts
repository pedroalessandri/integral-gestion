import type { CanActivate, ExecutionContext, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/** Guard stub that mimics TenantGuard: puebla request.authContext con el header X-Organization-Id. */
export class FakeTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      authContext?: AuthContext;
    }>();
    req.authContext = {
      userId: 'user-1',
      auth0Sub: 'auth0|user-1',
      email: 'u@example.com',
      displayName: 'U',
      isSuperadmin: false,
      organizationId: req.headers['x-organization-id'] ?? null,
      permissions: ['*'],
      requestId: 'req-1',
    };
    return true;
  }
}

export class AllowGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

/**
 * Levanta una app Nest con los controllers reales, TenantGuard fake y el resto de guards
 * de autorización permitidos. OrgParamGuard NO se overridea: es lo que se prueba.
 */
export async function createTenantApp(opts: {
  controllers: Type<unknown>[];
  providers: { provide: unknown; useValue: unknown }[];
  guardsToStub: Type<CanActivate>[];
  tenantGuard: Type<CanActivate>;
}): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    controllers: opts.controllers,
    providers: opts.providers as never[],
  }).overrideGuard(opts.tenantGuard).useClass(FakeTenantGuard);
  for (const g of opts.guardsToStub) {
    builder = builder.overrideGuard(g).useClass(AllowGuard);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
