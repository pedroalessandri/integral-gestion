import { cookies } from 'next/headers';
import { DEFAULT_ORGANIZATION_SECTOR } from '@gestion-publica/shared-types/core';
import { getMe } from '../me';
import { getLabelsForSector, type Labels } from './sector-labels';

/**
 * Etiquetas de la org activa para Server Components (ADR-0011 D3): cookie `activeOrgId` + `/me` cacheado.
 * Solo para el servidor (usa `next/headers`). Sin org activa o con `/me` caído, usa el sector público.
 */
export async function getLabels(): Promise<Labels> {
  const [cookieStore, me] = await Promise.all([cookies(), getMe()]);
  const cookieOrgId = cookieStore.get('activeOrgId')?.value ?? null;
  // Misma regla que el layout: cookie válida (org del usuario) o, si no, la primera org.
  const org = me?.orgs.find((o) => o.id === cookieOrgId) ?? me?.orgs[0] ?? null;
  return getLabelsForSector(org?.sector ?? DEFAULT_ORGANIZATION_SECTOR);
}
