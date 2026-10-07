import { describe, it, expect, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { OrgParamGuard } from './org-param.guard.js';
import { tenantContextStorage } from '../../modules/auth/context/tenant-context-storage.js';

const baseCtx: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|1',
  email: 'u@example.com',
  displayName: 'U',
  isSuperadmin: false,
  organizationId: 'org-A',
  permissions: [],
  requestId: 'req-1',
};

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('OrgParamGuard', () => {
  const guard = new OrgParamGuard();

  afterEach(() => {
    tenantContextStorage.disable();
  });

  it('pasa cuando el :orgId del path coincide con el tenant', () => {
    expect(guard.canActivate(makeContext({ authContext: baseCtx, params: { orgId: 'org-A' } }))).toBe(true);
  });

  it('403 TenantMismatch cuando el :orgId del path difiere del tenant', () => {
    expect(() =>
      guard.canActivate(makeContext({ authContext: baseCtx, params: { orgId: 'org-B' } })),
    ).toThrow(new ForbiddenException('TenantMismatch'));
  });

  it('403 TenantMismatch (falla cerrado) cuando la ruta no tiene :orgId', () => {
    expect(() => guard.canActivate(makeContext({ authContext: baseCtx, params: {} }))).toThrow(
      ForbiddenException,
    );
  });

  it('403 cuando el contexto no trae organización', () => {
    const noOrg = { ...baseCtx, organizationId: null };
    expect(() =>
      guard.canActivate(makeContext({ authContext: noOrg, params: { orgId: 'org-A' } })),
    ).toThrow(ForbiddenException);
  });

  it('403 cuando no hay contexto en request ni en ALS', () => {
    expect(() => guard.canActivate(makeContext({ params: { orgId: 'org-A' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('lee request.authContext con el ALS vacío', () => {
    expect(tenantContextStorage.getStore()).toBeUndefined();
    expect(guard.canActivate(makeContext({ authContext: baseCtx, params: { orgId: 'org-A' } }))).toBe(true);
  });

  it('usa el ALS solo como fallback cuando request.authContext no está', () => {
    tenantContextStorage.run(baseCtx, () => {
      expect(guard.canActivate(makeContext({ params: { orgId: 'org-A' } }))).toBe(true);
      expect(() => guard.canActivate(makeContext({ params: { orgId: 'org-B' } }))).toThrow(
        ForbiddenException,
      );
    });
  });

  it('request.authContext tiene prioridad sobre el ALS', () => {
    tenantContextStorage.run({ ...baseCtx, organizationId: 'org-B' }, () => {
      expect(guard.canActivate(makeContext({ authContext: baseCtx, params: { orgId: 'org-A' } }))).toBe(true);
    });
  });

  it('no exceptúa al superadmin', () => {
    const sa = { ...baseCtx, isSuperadmin: true };
    expect(() =>
      guard.canActivate(makeContext({ authContext: sa, params: { orgId: 'org-B' } })),
    ).toThrow(ForbiddenException);
  });
});
