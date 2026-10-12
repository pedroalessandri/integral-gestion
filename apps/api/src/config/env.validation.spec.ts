import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.validation.js';

const base = { DATABASE_URL: 'postgresql://x' };

describe('validateEnv — conector MCP', () => {
  it('queda apagado por defecto y con límites del ADR-0010', () => {
    const env = validateEnv({ ...base });
    expect(env.MCP_ENABLED).toBe(false);
    expect(env.MCP_RATE_READ_PER_MIN).toBe(60);
    expect(env.MCP_RATE_WRITE_PER_MIN).toBe(10);
    expect(env.MCP_RATE_WRITE_PER_DAY).toBe(300);
    expect(env.MCP_MAX_RESPONSE_CHARS).toBe(60_000);
  });

  it.each([
    ['false', false],
    ['0', false],
    ['', false],
    ['true', true],
    ['1', true],
  ])('MCP_ENABLED=%j -> %s', (raw, expected) => {
    const env = validateEnv({
      ...base,
      MCP_ENABLED: raw,
      MCP_RESOURCE_URL: 'https://api.example.org/mcp',
    });
    expect(env.MCP_ENABLED).toBe(expected);
  });

  it('rechaza un MCP_ENABLED inválido', () => {
    expect(() => validateEnv({ ...base, MCP_ENABLED: 'quizas' })).toThrow(/MCP_ENABLED/);
  });

  it('exige MCP_RESOURCE_URL cuando está habilitado', () => {
    expect(() => validateEnv({ ...base, MCP_ENABLED: 'true' })).toThrow(/MCP_RESOURCE_URL is required/);
  });

  it('exige una URL https sin query ni fragmento', () => {
    const enabled = { ...base, MCP_ENABLED: 'true' };
    expect(() => validateEnv({ ...enabled, MCP_RESOURCE_URL: 'ftp://x/mcp' })).toThrow(/absolute https URL/);
    expect(() => validateEnv({ ...enabled, MCP_RESOURCE_URL: 'https://x/mcp?a=1' })).toThrow(/absolute https URL/);
    expect(() => validateEnv({ ...enabled, MCP_RESOURCE_URL: 'https://x/otra-ruta' })).toThrow(/ending in \/mcp/);
    expect(() => validateEnv({ ...enabled, MCP_RESOURCE_URL: 'https://x/mcp' })).not.toThrow();
    expect(() => validateEnv({ ...enabled, MCP_RESOURCE_URL: 'http://api.example.org/mcp' })).toThrow(
      /absolute https URL/,
    );
    expect(() => validateEnv({ ...enabled, MCP_RESOURCE_URL: 'http://localhost:3000/mcp' })).not.toThrow();
    expect(() =>
      validateEnv({ ...enabled, NODE_ENV: 'production', MCP_RESOURCE_URL: 'http://localhost:3000/mcp' }),
    ).toThrow(/absolute https URL/);
  });

  it('parsea límites numéricos', () => {
    const env = validateEnv({ ...base, MCP_RATE_READ_PER_MIN: '5', MCP_MAX_RESPONSE_CHARS: '2000' });
    expect(env.MCP_RATE_READ_PER_MIN).toBe(5);
    expect(env.MCP_MAX_RESPONSE_CHARS).toBe(2000);
    expect(() => validateEnv({ ...base, MCP_RATE_READ_PER_MIN: 'x' })).toThrow(/MCP_RATE_READ_PER_MIN/);
  });

  it('topes HTTP del endpoint con defaults holgados y configurables', () => {
    const env = validateEnv({ ...base });
    expect(env.MCP_RATE_IP_PER_MIN).toBe(120);
    expect(env.MCP_RATE_HTTP_PER_MIN).toBe(300);
    expect(validateEnv({ ...base, MCP_RATE_IP_PER_MIN: '50' }).MCP_RATE_IP_PER_MIN).toBe(50);
  });

  it('falla si la audiencia del conector coincide con AUTH0_AUDIENCE', () => {
    const enabled = { ...base, MCP_ENABLED: 'true', MCP_RESOURCE_URL: 'https://api.example.org/mcp' };
    // default: la audiencia efectiva es MCP_RESOURCE_URL
    expect(() => validateEnv({ ...enabled, AUTH0_AUDIENCE: 'https://api.example.org/mcp' })).toThrow(/must differ from AUTH0_AUDIENCE/);
    // explícita
    expect(() =>
      validateEnv({ ...enabled, MCP_AUTH0_AUDIENCE: 'https://web-api', AUTH0_AUDIENCE: 'https://web-api' }),
    ).toThrow(/must differ from AUTH0_AUDIENCE/);
    expect(() => validateEnv({ ...enabled, AUTH0_AUDIENCE: 'https://web-api' })).not.toThrow();
    // apagado: no valida
    expect(() =>
      validateEnv({ ...base, MCP_RESOURCE_URL: 'https://api.example.org/mcp', AUTH0_AUDIENCE: 'https://api.example.org/mcp' }),
    ).not.toThrow();
  });
});
