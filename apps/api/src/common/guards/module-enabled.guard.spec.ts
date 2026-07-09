import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ModuleEnabledGuard } from './module-enabled.guard.js';

const mockAuthContext: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test User',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['metrics:read'],
  requestId: 'req-test',
};

function makeContext(authContext: AuthContext | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ authContext }),
    }),
  } as unknown as ExecutionContext;
}

describe('ModuleEnabledGuard', () => {
  const mockReflector = { getAllAndOverride: vi.fn() };
  const mockEnablementService = { isEnabled: vi.fn() };
  let guard: ModuleEnabledGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new ModuleEnabledGuard(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockReflector as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockEnablementService as any,
    );
  });

  it('allows requests when no @RequiresModule metadata is present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    expect(await guard.canActivate(makeContext(mockAuthContext))).toBe(true);
    expect(mockEnablementService.isEnabled).not.toHaveBeenCalled();
  });

  it('allows requests when the required module is enabled', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['indicadores-gestion']);
    mockEnablementService.isEnabled.mockResolvedValue(true);
    expect(await guard.canActivate(makeContext(mockAuthContext))).toBe(true);
    expect(mockEnablementService.isEnabled).toHaveBeenCalledWith('org-1', 'indicadores-gestion');
  });

  it('rejects with 403 ModuleDisabled when the module is disabled', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['indicadores-gestion']);
    mockEnablementService.isEnabled.mockResolvedValue(false);
    await expect(guard.canActivate(makeContext(mockAuthContext))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when ANY of multiple required modules is disabled', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['indicadores-gestion', 'indicadores-okr']);
    mockEnablementService.isEnabled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(guard.canActivate(makeContext(mockAuthContext))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('does NOT bypass superadmins: a disabled module is disabled for everyone', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['indicadores-gestion']);
    mockEnablementService.isEnabled.mockResolvedValue(false);
    await expect(
      guard.canActivate(makeContext({ ...mockAuthContext, isSuperadmin: true, permissions: ['*'] })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when there is no organization context', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['indicadores-gestion']);
    await expect(
      guard.canActivate(makeContext({ ...mockAuthContext, organizationId: null })),
    ).rejects.toThrow(ForbiddenException);
    expect(mockEnablementService.isEnabled).not.toHaveBeenCalled();
  });

  it('caches enablement lookups within the TTL', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['indicadores-gestion']);
    mockEnablementService.isEnabled.mockResolvedValue(true);

    await guard.canActivate(makeContext(mockAuthContext));
    await guard.canActivate(makeContext(mockAuthContext));

    expect(mockEnablementService.isEnabled).toHaveBeenCalledTimes(1);
  });
});
