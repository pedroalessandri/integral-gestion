'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PlanningTreeDto } from '@gestion-publica/shared-types/okr';
import { DEFAULT_VIEW, type PlanningTreeViewMode } from './planning-tree-filters';
import { buildTree, expandableKeys } from './planning-tree-view';

/** Estado de la vista del árbol: modo (ejes/unidades) y nodos colapsados. No hace requests. */
export function usePlanningTreeView(dto: PlanningTreeDto, initialView: PlanningTreeViewMode = DEFAULT_VIEW) {
  const [view, setViewState] = useState<PlanningTreeViewMode>(initialView);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const root = useMemo(() => buildTree(dto, view), [dto, view]);
  const allExpandable = useMemo(() => expandableKeys(root), [root]);

  const setView = useCallback((next: PlanningTreeViewMode) => {
    setViewState(next);
    // Deja la vista compartible en la URL sin pedir de nuevo el árbol.
    const url = new URL(window.location.href);
    if (next === DEFAULT_VIEW) url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }, []);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => setCollapsed(new Set(allExpandable)), [allExpandable]);

  return { view, setView, root, collapsed, toggle, expandAll, collapseAll };
}
