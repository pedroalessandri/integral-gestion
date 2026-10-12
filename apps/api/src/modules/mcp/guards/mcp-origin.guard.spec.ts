import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { McpOriginGuard, originMatches } from './mcp-origin.guard.js';
import type { McpConfig } from '../config/mcp-config.service.js';

const ctx = (origin?: string): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers: origin === undefined ? {} : { origin } }) }) }) as unknown as ExecutionContext;

describe('originMatches', () => {
  it('compara exacto, sin distinguir mayúsculas', () => {
    expect(originMatches('https://app.example.org', 'https://APP.example.org')).toBe(true);
    expect(originMatches('https://app.example.org', 'https://otra.example.org')).toBe(false);
  });

  it('el comodín :* admite solo puertos numéricos', () => {
    expect(originMatches('http://localhost:6274', 'http://localhost:*')).toBe(true);
    expect(originMatches('http://localhost:6274/x', 'http://localhost:*')).toBe(false);
    expect(originMatches('http://localhost', 'http://localhost:*')).toBe(false);
    expect(originMatches('http://localhost.evil.example:80', 'http://localhost:*')).toBe(false);
    expect(originMatches('https://localhost:3000', 'http://localhost:*')).toBe(false);
  });
});

describe('McpOriginGuard', () => {
  const guard = (allowed: string[]) => new McpOriginGuard({ allowedOrigins: allowed } as unknown as McpConfig);

  it('sin Origin pasa (los backends de los proveedores no lo mandan)', () => {
    expect(guard([]).canActivate(ctx())).toBe(true);
  });

  it('con Origin y allow-list vacía rechaza (403)', () => {
    expect(() => guard([]).canActivate(ctx('https://evil.example'))).toThrow(/OriginNotAllowed/);
  });

  it('con Origin permitido pasa', () => {
    expect(guard(['http://localhost:*']).canActivate(ctx('http://localhost:6274'))).toBe(true);
  });
});
