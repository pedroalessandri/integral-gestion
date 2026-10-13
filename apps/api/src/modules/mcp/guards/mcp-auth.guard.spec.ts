import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { McpAuthGuard } from './mcp-auth.guard.js';
import type { McpConfig } from '../config/mcp-config.service.js';

function setup(payload: Record<string, unknown>, linked: unknown = null) {
  const upsert = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', displayName: 'A', isSuperadmin: false });
  const findLinked = vi.fn().mockResolvedValue(linked);
  const verifier = { verify: vi.fn().mockResolvedValue(payload) };
  const guard = new McpAuthGuard(
    { audience: 'aud', metadataUrl: 'https://x/.well-known/oauth-protected-resource/mcp' } as McpConfig,
    verifier as never,
    { upsertFromJwt: upsert, findLinkedByAuth0Sub: findLinked } as never,
  );
  const request: Record<string, unknown> = { headers: { authorization: 'Bearer tok' } };
  const headers: Record<string, string> = {};
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }) }),
  } as unknown as ExecutionContext;
  return { guard, context, upsert, findLinked, headers, request };
}

describe('McpAuthGuard — email_verified', () => {
  it('rechaza con 401 un token con email_verified=false, sin tocar la tabla de usuarios', async () => {
    const { guard, context, upsert, headers } = setup({ sub: 's', email: 'a@b.c', email_verified: false });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(upsert).not.toHaveBeenCalled();
    expect(headers['WWW-Authenticate']).toContain('error="invalid_token"');
  });

  it.each([true, undefined])('acepta email_verified=%s', async (verified) => {
    const { guard, context, request } = setup({ sub: 's', email: 'a@b.c', email_verified: verified, scope: 'plan:read' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request['mcpSession']).toBeDefined();
  });
});

describe('McpAuthGuard — token sin email', () => {
  it('acepta al usuario ya vinculado por sub, sin crear ni reclamar por email', async () => {
    const linked = { id: 'u9', auth0Sub: 's', email: 'x@y.z', displayName: 'X', isSuperadmin: false };
    const { guard, context, upsert, findLinked, request } = setup({ sub: 's', scope: 'plan:read' }, linked);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findLinked).toHaveBeenCalledWith('s');
    expect(upsert).not.toHaveBeenCalled();
    expect((request['mcpSession'] as { authContext: { userId: string } }).authContext.userId).toBe('u9');
  });

  it('rechaza con 403 si no hay usuario local vinculado a ese sub', async () => {
    const { guard, context, upsert } = setup({ sub: 's', scope: 'plan:read' }, null);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rechaza con 401 un token sin sub', async () => {
    const { guard, context } = setup({ email: 'a@b.c' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
