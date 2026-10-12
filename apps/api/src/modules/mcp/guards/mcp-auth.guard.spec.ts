import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { McpAuthGuard } from './mcp-auth.guard.js';
import type { McpConfig } from '../config/mcp-config.service.js';

function setup(payload: Record<string, unknown>) {
  const upsert = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', displayName: 'A', isSuperadmin: false });
  const verifier = { verify: vi.fn().mockResolvedValue(payload) };
  const guard = new McpAuthGuard(
    { audience: 'aud', metadataUrl: 'https://x/.well-known/oauth-protected-resource/mcp' } as McpConfig,
    verifier as never,
    { upsertFromJwt: upsert } as never,
  );
  const request: Record<string, unknown> = { headers: { authorization: 'Bearer tok' } };
  const headers: Record<string, string> = {};
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }) }),
  } as unknown as ExecutionContext;
  return { guard, context, upsert, headers, request };
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
