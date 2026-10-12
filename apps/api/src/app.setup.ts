import { VersioningType, type INestApplication } from '@nestjs/common';
import type { CorsOptions, CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';
import { MCP_PREFIX_EXCLUDES, isMcpRoutePath } from './config/mcp-routes.js';

/**
 * Configuración HTTP común de la API (prefijo, versionado, CORS). La usan `main.ts` y los tests de integración,
 * para que prueben la misma topología de rutas que producción.
 */
export function configureApp(app: INestApplication): void {
  const corsDelegate: CorsOptionsDelegate<{ url?: string }> = (req, cb) => {
    // `/mcp` y su metadata los consumen backends de Anthropic/OpenAI, no navegadores: sin cabeceras CORS. El
    // `Origin` de `/mcp` lo valida el propio módulo (403 si no está en MCP_ALLOWED_ORIGINS, ADR-0010 D2).
    if (isMcpRoutePath(req.url)) {
      cb(null, { origin: false } satisfies CorsOptions);
      return;
    }
    cb(null, {
      origin: (origin, originCb) => {
        const allowed = (process.env['CORS_ALLOWED_ORIGINS'] ?? 'http://localhost:3001')
          .split(',')
          .map((s) => s.trim());
        if (!origin || allowed.includes(origin)) return originCb(null, true);
        return originCb(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-Request-Id'],
    });
  };
  app.enableCors(corsDelegate);

  // Global API prefix + URI versioning: /api/v1/... (salvo el conector MCP, que vive en /mcp).
  app.setGlobalPrefix('api', { exclude: MCP_PREFIX_EXCLUDES });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
