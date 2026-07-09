import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { SuperadminOnlyGuard } from './superadmin-only.guard.js';
import { tenantContextStorage } from '../context/tenant-context-storage.js';

const superadmin: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|super',
  email: 'super@example.com',
  displayName: 'Super',
  isSuperadmin: true,
  organizationId: 'org-1',
  permissions: ['*'],
  requestId: 'req-1',
};

const regularUser: AuthContext = {
  ...superadmin,
  auth0Sub: 'auth0|regular',
  email: 'regular@example.com',
  displayName: 'Regular',
  isSuperadmin: false,
  permissions: [],
};

/** Builds an ExecutionContext whose request carries the given authContext. */
function makeContext(authContext: AuthContext | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ authContext }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuperadminOnlyGuard', () => {
  let guard: SuperadminOnlyGuard;

  beforeEach(() => {
    guard = new SuperadminOnlyGuard();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows a superadmin present in request.authContext', () => {
    expect(guard.canActivate(makeContext(superadmin))).toBe(true);
  });

  it('rejects a non-superadmin with SuperadminRequired (403)', () => {
    expect(() => guard.canActivate(makeContext(regularUser))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext(regularUser))).toThrow('SuperadminRequired');
  });

  it('rejects when no context is available in request nor ALS', () => {
    vi.spyOn(tenantContextStorage, 'getStore').mockReturnValue(undefined);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('falls back to the ALS store when the request has no authContext', () => {
    vi.spyOn(tenantContextStorage, 'getStore').mockReturnValue(superadmin);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });
});
