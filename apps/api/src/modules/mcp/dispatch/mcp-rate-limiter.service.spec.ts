import { describe, it, expect } from 'vitest';
import { McpRateLimiter } from './mcp-rate-limiter.service.js';
import type { McpConfig } from '../config/mcp-config.service.js';

const config = (over: Partial<McpConfig> = {}): McpConfig =>
  ({ rateReadPerMin: 3, rateWritePerMin: 2, rateWritePerDay: 4, ...over }) as McpConfig;

describe('McpRateLimiter', () => {
  it('permite hasta el cupo por minuto y rechaza la siguiente con el tiempo de espera', () => {
    const limiter = new McpRateLimiter(config());
    const t0 = 1_000_000;
    expect(limiter.check('u1', 'read', t0).allowed).toBe(true);
    expect(limiter.check('u1', 'read', t0 + 1_000).allowed).toBe(true);
    expect(limiter.check('u1', 'read', t0 + 2_000).allowed).toBe(true);
    const denied = limiter.check('u1', 'read', t0 + 3_000);
    expect(denied).toEqual({ allowed: false, retryAfterSeconds: 57 });
  });

  it('la ventana se desliza: pasado el minuto vuelve a permitir', () => {
    const limiter = new McpRateLimiter(config());
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) limiter.check('u1', 'read', t0);
    expect(limiter.check('u1', 'read', t0 + 30_000).allowed).toBe(false);
    expect(limiter.check('u1', 'read', t0 + 60_001).allowed).toBe(true);
  });

  it('un usuario no consume el cupo de otro', () => {
    const limiter = new McpRateLimiter(config());
    for (let i = 0; i < 3; i += 1) limiter.check('u1', 'read', 1_000);
    expect(limiter.check('u1', 'read', 1_001).allowed).toBe(false);
    expect(limiter.check('u2', 'read', 1_001).allowed).toBe(true);
  });

  it('lecturas y escrituras tienen cupos separados', () => {
    const limiter = new McpRateLimiter(config());
    for (let i = 0; i < 3; i += 1) limiter.check('u1', 'read', 1_000);
    expect(limiter.check('u1', 'write', 1_001).allowed).toBe(true);
  });

  it('las escrituras respetan además el cupo diario', () => {
    const limiter = new McpRateLimiter(config());
    const minute = 60_001;
    for (let i = 0; i < 2; i += 1) expect(limiter.check('u1', 'write', i * minute).allowed).toBe(true);
    // Dos escrituras más en otros minutos: la cuarta del día entra, la quinta no.
    expect(limiter.check('u1', 'write', 2 * minute).allowed).toBe(true);
    expect(limiter.check('u1', 'write', 3 * minute).allowed).toBe(true);
    const denied = limiter.check('u1', 'write', 4 * minute);
    expect(denied.allowed).toBe(false);
    expect(denied.allowed === false && denied.retryAfterSeconds).toBeGreaterThan(3600);
  });

  it('una llamada rechazada no consume cupo', () => {
    const limiter = new McpRateLimiter(config({ rateReadPerMin: 1 }));
    expect(limiter.check('u1', 'read', 1_000).allowed).toBe(true);
    for (let i = 0; i < 10; i += 1) limiter.check('u1', 'read', 1_100);
    expect(limiter.check('u1', 'read', 61_001).allowed).toBe(true);
  });
});
