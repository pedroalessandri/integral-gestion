'use client';

import type { AxisDto } from '@gestion-publica/shared-types/planning';
import type { OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';
import { Button } from '@/components/ui/button';
import { LABELS, ORG_UNIT_KIND_LABELS, PLANNING_TREE_LABELS as L } from '@/lib/labels';
import { flattenTree } from '@/features/org-structure/tree';
import { hasActiveFilters, type PlanningTreeFilters } from '../planning-tree-filters';
import { usePlanningTreeFilters } from '../usePlanningTreeFilters';

interface PeriodOption {
  id: string;
  code: string;
}

interface Props {
  filters: PlanningTreeFilters;
  periods: PeriodOption[];
  axes: AxisDto[];
  unitTree: OrgUnitTreeNodeDto[];
}

const SELECT_CLASS = 'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50';

export function PlanningTreeFilterBar({ filters, periods, axes, unitTree }: Props) {
  const { pending, update, clear } = usePlanningTreeFilters(filters);
  const units = flattenTree(unitTree);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-end"
      aria-busy={pending}
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="space-y-1 text-sm font-medium text-neutral-700">
        {L.filters.period}
        <select
          className={SELECT_CLASS}
          value={filters.periodId ?? ''}
          disabled={pending}
          onChange={(e) => update({ periodId: e.target.value || null })}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium text-neutral-700">
        {LABELS.axis.singular}
        <select
          className={SELECT_CLASS}
          value={filters.axisId ?? ''}
          disabled={pending}
          onChange={(e) => update({ axisId: e.target.value || null })}
        >
          <option value="">{L.filters.allAxes}</option>
          {axes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium text-neutral-700">
        {LABELS.unit.singular}
        <select
          className={SELECT_CLASS}
          value={filters.orgUnitId ?? ''}
          disabled={pending}
          onChange={(e) => update({ orgUnitId: e.target.value || null })}
        >
          <option value="">{L.filters.allUnits}</option>
          {units.map((u) => (
            <option key={u.node.id} value={u.node.id}>
              {'— '.repeat(Math.max(0, u.depth - 1))}
              {u.node.name} ({ORG_UNIT_KIND_LABELS[u.node.kind]})
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        {hasActiveFilters(filters) && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={pending}>
            {L.filters.clear}
          </Button>
        )}
        {pending && (
          <span role="status" className="text-xs text-neutral-500">
            {L.filters.loading}
          </span>
        )}
      </div>
    </form>
  );
}
