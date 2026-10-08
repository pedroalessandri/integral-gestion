'use client';

import { useEffect, useMemo, useState } from 'react';
import { listOrgUnitTreeAction } from './org-structure-actions';
import { buildInviteScopeOptions } from './invite-scope';

/** Carga el árbol de unidades y arma las opciones del selector de alcance de la invitación. */
export function useInviteScope(orgId: string, enabled: boolean) {
  const [tree, setTree] = useState<Awaited<ReturnType<typeof listOrgUnitTreeAction>> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listOrgUnitTreeAction(orgId).then((r) => {
      if (!cancelled) setTree(r);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, enabled]);

  const options = useMemo(() => (tree?.ok ? buildInviteScopeOptions(tree.data) : []), [tree]);
  return { options, loading: enabled && tree === null, error: tree && !tree.ok ? tree.error : null };
}
