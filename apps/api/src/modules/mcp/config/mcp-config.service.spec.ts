import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { McpConfig, buildMetadataUrl } from './mcp-config.service.js';

const make = (values: Record<string, unknown>): McpConfig =>
  new McpConfig({
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (values[k] === undefined) throw new Error(`falta ${k}`);
      return values[k];
    },
  } as unknown as ConfigService);

describe('McpConfig', () => {
  it('RFC 9728: la ruta bien conocida se inserta entre el host y la ruta del recurso', () => {
    expect(buildMetadataUrl('https://api.example.org/mcp')).toBe(
      'https://api.example.org/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('la audiencia por defecto es la URL del recurso y el servidor de autorización lleva barra final', () => {
    const c = make({
      MCP_ENABLED: true,
      MCP_RESOURCE_URL: 'https://api.example.org/mcp',
      AUTH0_ISSUER_BASE_URL: 'https://tenant.auth0.com',
    });
    expect(c.audience).toBe('https://api.example.org/mcp');
    expect(c.authorizationServer).toBe('https://tenant.auth0.com/');
    expect(c.enabled).toBe(true);
    expect(c.metadataUrl).toBe('https://api.example.org/.well-known/oauth-protected-resource/mcp');
  });

  it('una audiencia explícita pisa la URL del recurso; los orígenes se parsean', () => {
    const c = make({
      MCP_RESOURCE_URL: 'https://api.example.org/mcp',
      MCP_AUTH0_AUDIENCE: 'https://otra.example',
      MCP_ALLOWED_ORIGINS: ' http://localhost:* , https://a.example ,',
      AUTH0_ISSUER_BASE_URL: 'https://t.auth0.com/',
    });
    expect(c.audience).toBe('https://otra.example');
    expect(c.allowedOrigins).toEqual(['http://localhost:*', 'https://a.example']);
    expect(c.enabled).toBe(false);
  });
});
