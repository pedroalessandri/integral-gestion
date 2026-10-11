import { cache } from 'react';
import type { MeDto } from '@gestion-publica/shared-types/core';
import { apiFetch } from './api-client';

/**
 * `GET /api/v1/me` una sola vez por request (`React.cache`): lo comparten el layout y `getLabels()`.
 * Devuelve null si la API no responde o falla (el layout muestra el aviso y la UI cae al sector público).
 */
export const getMe = cache(async (): Promise<MeDto | null> => {
  try {
    const res = await apiFetch('/api/v1/me');
    return res.ok ? ((await res.json()) as MeDto) : null;
  } catch {
    return null;
  }
});
