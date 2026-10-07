'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  CreateOrgUnitDto,
  MemberDto,
  OrgUnitTreeNodeDto,
  UpdateOrgUnitDto,
} from '@gestion-publica/shared-types/core';
import { useActionRunner } from '@/features/planning/useActionRunner';
import {
  createOrgUnitAction,
  deleteOrgUnitAction,
  setMemberScopeAction,
  updateOrgUnitAction,
} from './org-structure-actions';
import { flattenTree, membersOfUnit, type FlatUnit } from './tree';

interface Options {
  orgId: string;
  tree: OrgUnitTreeNodeDto[];
  members: MemberDto[];
}

export function useOrgStructure({ orgId, tree, members }: Options) {
  const { pending, error, run, clearError } = useActionRunner();
  /** Miembros que bloquearon el último borrado (409 OrgUnitHasMembers). */
  const [blockingMembers, setBlockingMembers] = useState<MemberDto[]>([]);

  const units = useMemo(() => flattenTree(tree), [tree]);
  const unitName = useCallback(
    (id: string | null) => (id ? (units.find((u) => u.node.id === id)?.node.name ?? 'Unidad eliminada') : null),
    [units],
  );

  const createUnit = useCallback(
    async (input: CreateOrgUnitDto) => (await run(() => createOrgUnitAction(orgId, input))).ok,
    [orgId, run],
  );

  const updateUnit = useCallback(
    async (id: string, input: UpdateOrgUnitDto) => (await run(() => updateOrgUnitAction(orgId, id, input))).ok,
    [orgId, run],
  );

  const deleteUnit = useCallback(
    async (unit: FlatUnit) => {
      setBlockingMembers([]);
      const result = await run(() => deleteOrgUnitAction(orgId, unit.node.id));
      if (!result.ok && result.code === 'OrgUnitHasMembers') {
        // La API no devuelve la lista (el filtro global descarta `members`): la deducimos de la lista cargada.
        setBlockingMembers(membersOfUnit(members, unit.node.id));
      }
      return result.ok;
    },
    [members, orgId, run],
  );

  const setScope = useCallback(
    async (userId: string, orgUnitId: string | null) =>
      (await run(() => setMemberScopeAction(orgId, userId, { orgUnitId }))).ok,
    [orgId, run],
  );

  const clearBlocking = useCallback(() => {
    setBlockingMembers([]);
    clearError();
  }, [clearError]);

  return {
    units,
    unitName,
    pending,
    error,
    blockingMembers,
    clearError: clearBlocking,
    createUnit,
    updateUnit,
    deleteUnit,
    setScope,
  };
}
