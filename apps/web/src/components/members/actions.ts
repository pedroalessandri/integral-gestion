'use server';

import { apiFetch } from '@/lib/api-client';

export interface MemberItem {
  userId: string;
  email: string;
  displayName: string;
  roleKey: string;
  roleName: string;
  assignedAt: string;
  isPending: boolean;
}

export async function listMembersAction(input: { orgId: string }): Promise<{
  error?: string;
  members?: MemberItem[];
}> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/members`, { orgId: input.orgId });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    const data = await res.json() as { items?: MemberItem[] } | MemberItem[];
    const members: MemberItem[] = Array.isArray(data)
      ? data
      : (data as { items?: MemberItem[] }).items ?? [];
    return { members };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function inviteMemberAction(input: {
  orgId: string;
  email: string;
  roleKey: 'org-admin' | 'org-user' | 'org-reader';
}): Promise<{ error?: string; member?: unknown }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch(`/api/v1/orgs/${orgId}/members/invite`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { member: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function changeMemberRoleAction(input: {
  orgId: string;
  userId: string;
  roleKey: 'org-admin' | 'org-user' | 'org-reader';
}): Promise<{ error?: string }> {
  try {
    const { orgId, userId, roleKey } = input;
    const res = await apiFetch(`/api/v1/orgs/${orgId}/members/${userId}/role`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify({ roleKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function removeMemberAction(input: {
  orgId: string;
  userId: string;
}): Promise<{ error?: string }> {
  try {
    const { orgId, userId } = input;
    const res = await apiFetch(`/api/v1/orgs/${orgId}/members/${userId}`, {
      method: 'DELETE',
      orgId,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
