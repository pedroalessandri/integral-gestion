'use server';

import { apiFetch } from '@/lib/api-client';

export interface OrgModuleInfo {
  organizationId: string;
  moduleKey: string;
  enabledAt: string;
  enabledByUserId: string;
  disabledAt: string | null;
  disabledByUserId: string | null;
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message ?? `HTTP ${res.status}`;
}

/** Lists all module enablement rows for an org (enabled and disabled). Superadmin-only on the API. */
export async function listModulesAction(input: {
  orgId: string;
}): Promise<{ error?: string; modules?: OrgModuleInfo[] }> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/modules`, { orgId: input.orgId });
    if (!res.ok) return { error: await errorMessage(res) };
    const data: unknown = await res.json();
    const modules = Array.isArray(data)
      ? (data as OrgModuleInfo[])
      : ((data as { items?: OrgModuleInfo[] }).items ?? []);
    return { modules };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function enableModuleAction(input: {
  orgId: string;
  moduleKey: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/modules/${input.moduleKey}/enable`, {
      method: 'POST',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 201) return { error: await errorMessage(res) };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function disableModuleAction(input: {
  orgId: string;
  moduleKey: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/modules/${input.moduleKey}/disable`, {
      method: 'POST',
      orgId: input.orgId,
    });
    if (!res.ok) return { error: await errorMessage(res) };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
