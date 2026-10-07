'use server';

import type {
  CreateOrgUnitDto,
  MemberDto,
  OrgUnitDto,
  OrgUnitTreeNodeDto,
  SetMemberScopeDto,
  UpdateOrgUnitDto,
} from '@gestion-publica/shared-types/core';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import {
  failure,
  unexpectedFailure,
  type ActionResult,
} from '@/features/planning/error-messages';

const base = (orgId: string) => `/api/v1/orgs/${orgId}`;

export async function listOrgUnitTreeAction(orgId: string): Promise<ActionResult<OrgUnitTreeNodeDto[]>> {
  try {
    const res = await apiFetch(`${base(orgId)}/org-units/tree`, { orgId });
    if (!res.ok) return failure(await readApiError(res));
    const body = (await res.json()) as { items?: OrgUnitTreeNodeDto[] };
    return { ok: true, data: body.items ?? [] };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function listScopeMembersAction(orgId: string): Promise<ActionResult<MemberDto[]>> {
  try {
    const res = await apiFetch(`${base(orgId)}/members`, { orgId });
    if (!res.ok) return failure(await readApiError(res));
    const body = (await res.json()) as { items?: MemberDto[] } | MemberDto[];
    return { ok: true, data: Array.isArray(body) ? body : (body.items ?? []) };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function createOrgUnitAction(
  orgId: string,
  input: CreateOrgUnitDto,
): Promise<ActionResult<OrgUnitDto>> {
  try {
    const res = await apiFetch(`${base(orgId)}/org-units`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(input),
    });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as OrgUnitDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function updateOrgUnitAction(
  orgId: string,
  id: string,
  input: UpdateOrgUnitDto,
): Promise<ActionResult<OrgUnitDto>> {
  try {
    const res = await apiFetch(`${base(orgId)}/org-units/${id}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(input),
    });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as OrgUnitDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function deleteOrgUnitAction(orgId: string, id: string): Promise<ActionResult> {
  try {
    const res = await apiFetch(`${base(orgId)}/org-units/${id}`, { method: 'DELETE', orgId });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: null };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function setMemberScopeAction(
  orgId: string,
  userId: string,
  input: SetMemberScopeDto,
): Promise<ActionResult> {
  try {
    const res = await apiFetch(`${base(orgId)}/members/${userId}/scope`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(input),
    });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: null };
  } catch (err) {
    return unexpectedFailure(err);
  }
}
