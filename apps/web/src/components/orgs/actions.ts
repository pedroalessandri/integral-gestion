'use server';

import { apiFetch } from '@/lib/api-client';

export async function createOrgAction(input: {
  slug: string;
  name: string;
  firstPeriod: {
    code: string;
    startsAt: string;
    endsAt: string;
  };
}): Promise<{ error?: string; org?: unknown }> {
  try {
    const res = await apiFetch('/api/v1/orgs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? `HTTP ${res.status}` };
    }
    const org = await res.json();
    return { org };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function getOrganizationAction(orgId: string): Promise<{
  error?: string;
  organization?: {
    id: string;
    slug: string;
    name: string;
    mission?: string | null;
    vision?: string | null;
    values?: string | null;
    context?: string | null;
  };
}> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${orgId}`, { orgId });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: (err as { message?: string }).message ?? `HTTP ${res.status}` };
    }
    return { organization: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function updateOrganizationAction(input: {
  orgId: string;
  name?: string;
  slug?: string;
  mission?: string | null;
  vision?: string | null;
  values?: string | null;
  context?: string | null;
}): Promise<{ error?: string; organization?: unknown }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch(`/api/v1/orgs/${orgId}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: (err as { message?: string }).message ?? `HTTP ${res.status}` };
    }
    return { organization: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function getAiUsageAction(orgId: string): Promise<{
  error?: string;
  usage?: { used: number; limit: number; percentage: number; resetsAt: string };
}> {
  try {
    const res = await apiFetch(`/api/v1/ai/usage`, { orgId });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: (err as { message?: string }).message ?? `HTTP ${res.status}` };
    }
    return { usage: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
