import { describe, it, expect } from 'vitest';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { McpIpThrottleGuard, McpUserThrottleGuard } from './mcp-throttle.guard.js';
import { McpRateLimiter } from '../dispatch/mcp-rate-limiter.service.js';
import type { McpConfig } from '../config/mcp-config.service.js';

const limiter = (): McpRateLimiter => new McpRateLimiter({ rateIpPerMin: 2, rateHttpPerMin: 3 } as McpConfig);

function ctx(request: object): { context: ExecutionContext; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const response = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext;
  return { context, headers };
}

describe('McpIpThrottleGuard', () => {
  it('corta con 429 y Retry-After al pasar el tope por IP, sin token', () => {
    const guard = new McpIpThrottleGuard(limiter());
    const { context, headers } = ctx({ ip: '1.2.3.4', headers: {} });
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    try {
      guard.canActivate(context);
      expect.unreachable();
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('cada IP tiene su cupo', () => {
    const guard = new McpIpThrottleGuard(limiter());
    for (let i = 0; i < 2; i += 1) guard.canActivate(ctx({ ip: 'a' }).context);
    expect(guard.canActivate(ctx({ ip: 'b' }).context)).toBe(true);
  });
});

describe('McpUserThrottleGuard', () => {
  const session = (userId: string) => ({ mcpSession: { authContext: { userId } } });

  it('cuenta todo request del usuario (initialize, tools/list) y corta con 429', () => {
    const guard = new McpUserThrottleGuard(limiter());
    for (let i = 0; i < 3; i += 1) expect(guard.canActivate(ctx(session('u1')).context)).toBe(true);
    expect(() => guard.canActivate(ctx(session('u1')).context)).toThrow(HttpException);
    expect(guard.canActivate(ctx(session('u2')).context)).toBe(true);
  });

  it('sin sesión: 401 (default deny)', () => {
    const guard = new McpUserThrottleGuard(limiter());
    expect(() => guard.canActivate(ctx({}).context)).toThrow(HttpException);
  });

  it('el cupo por IP y el de usuario son contadores separados', () => {
    const l = limiter();
    for (let i = 0; i < 2; i += 1) new McpIpThrottleGuard(l).canActivate(ctx({ ip: 'x' }).context);
    expect(new McpUserThrottleGuard(l).canActivate(ctx(session('x')).context)).toBe(true);
  });
});
