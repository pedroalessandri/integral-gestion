'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PlanningGanttDto } from '@gestion-publica/shared-types/okr';
import { buildGanttRows, toggleAll, toggleId } from './executive-gantt-rows';

/** Estado de UI del Gantt: tareas visibles y objetivos colapsados. Los datos llegan por props (un request por filtro). */
export function useExecutiveGantt(data: PlanningGanttDto) {
  const [showTasks, setShowTasks] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => buildGanttRows(data, { showTasks, collapsedIds }), [data, showTasks, collapsedIds]);
  const hasObjectives = data.objectives.length > 0;
  const allCollapsed = hasObjectives && collapsedIds.size === data.objectives.length;

  const toggleObjective = useCallback((id: string) => setCollapsedIds((prev) => toggleId(prev, id)), []);
  const toggleAllObjectives = useCallback(() => setCollapsedIds((prev) => toggleAll(data, prev)), [data]);

  return { rows, showTasks, setShowTasks, allCollapsed, hasObjectives, toggleObjective, toggleAllObjectives };
}
