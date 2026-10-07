'use client';

import { useEffect, useState } from 'react';
import { listOrgUnitTreeAction } from '@/features/org-structure/org-structure-actions';
import { findUnit, flattenTree, type FlatUnit } from '@/features/org-structure/tree';

/** Unidades donde puede vivir un proyecto (RN-P4): la del objetivo y sus descendientes. */
export function useProjectUnits(orgId: string, objectiveUnitId: string | null) {
  const [units, setUnits] = useState<FlatUnit[]>([]);
  const [loading, setLoading] = useState(objectiveUnitId !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectiveUnitId) return;
    let cancelled = false;
    listOrgUnitTreeAction(orgId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        const root = findUnit(r.data, objectiveUnitId);
        setUnits(root ? flattenTree([root.node], root.depth) : []);
      } else {
        setError(r.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, objectiveUnitId]);

  return { units, loading, error };
}
