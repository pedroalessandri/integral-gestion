import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Throttlers globales de la API.
 *
 * `@nestjs/throttler` v6 aplica TODOS los throttlers de `forRoot` a TODAS las rutas. Por eso `ai` no limita por
 * defecto: el límite real (10 req/min por usuario, ADR-0005 D12) lo pone `@Throttle({ ai: { limit: 10, ... } })`
 * en las rutas de IA (`ai.controller.ts`). Con `limit: 10` acá, cada ruta de la API quedaba en 10 req/min.
 */
export const THROTTLERS: ThrottlerOptions[] = [
  {
    ttl: 60_000, // 60 seconds
    limit: 100,
  },
  {
    name: 'ai',
    ttl: 60_000,
    limit: Number.MAX_SAFE_INTEGER,
  },
];
