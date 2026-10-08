import { describe, it, expect, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { OrgIdParamGuard } from './org-id-param.guard.js';
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

describe('OrgIdParamGuard', () => {
  const guard = new OrgIdParamGuard();

  afterEach(() => {
    tenantContextStorage.disable();
  });

  it('pasa cuando el :id del path es el tenant', () => {
    expect(guard.canActivate(makeContext({ authContext: baseCtx, params: { id: 'org-A' } }))).toBe(true);
  });

  it('403 TenantMismatch cuando el :id difiere del tenant', () => {
    expect(() => guard.canActivate(makeContext({ authContext: baseCtx, params: { id: 'org-B' } }))).toThrow(
      new ForbiddenException('TenantMismatch'),
    );
  });

  it('falla cerrado sin :id, sin organización o sin contexto', () => {
    expect(() => guard.canActivate(makeContext({ authContext: baseCtx, params: {} }))).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(makeContext({ authContext: { ...baseCtx, organizationId: null }, params: { id: 'org-A' } })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext({ params: { id: 'org-A' } }))).toThrow(ForbiddenException);
  });

  it('usa el ALS solo como fallback', () => {
    tenantContextStorage.run(baseCtx, () => {
      expect(guard.canActivate(makeContext({ params: { id: 'org-A' } }))).toBe(true);
    });
  });
});
