'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PlanningTreeDto } from '@gestion-publica/shared-types/okr';
import { Button } from '@/components/ui/button';
import { PLANNING_TREE_LABELS as L } from '@/lib/labels';
import type { PlanningTreeViewMode } from '../planning-tree-filters';
import type { TreeNode } from '../planning-tree-view';
import { usePlanningTreeView } from '../usePlanningTreeView';
import { ReadingPair } from './reading-pair';

interface Props {
  data: PlanningTreeDto;
  initialView: PlanningTreeViewMode;
}

const VIEWS: PlanningTreeViewMode[] = ['axes', 'units'];

export function PlanningTreeView({ data, initialView }: Props) {
  const t = usePlanningTreeView(data, initialView);
  const hasPlan = data.plan.id !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={L.views.legend} className="inline-flex rounded-md border border-neutral-300 bg-white p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={t.view === v}
              onClick={() => t.setView(v)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                t.view === v ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {L.views[v]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={t.expandAll}>
            {L.expandAll}
          </Button>
          <Button variant="outline" size="sm" onClick={t.collapseAll}>
            {L.collapseAll}
          </Button>
        </div>
      </div>

      {!hasPlan && t.view === 'axes' && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {L.noPlanHint}
        </p>
      )}

      <ul className="space-y-2" aria-label={L.title}>
        <TreeItem node={t.root} depth={0} collapsed={t.collapsed} onToggle={t.toggle} />
      </ul>
    </div>
  );
}

interface ItemProps {
  node: TreeNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

function TreeItem({ node, depth, collapsed, onToggle }: ItemProps) {
  const expandable = node.children.length > 0;
  const expanded = expandable && !collapsed.has(node.key);
  const groupId = `group-${node.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const isObjective = node.kind === 'objective';

  return (
    <li data-testid={`node-${node.kind}`}>
      <div
        className={`rounded-lg border p-3 ${isObjective ? 'border-neutral-200 bg-white' : 'border-neutral-300 bg-neutral-50'}`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {expandable ? (
            <button
              type="button"
              onClick={() => onToggle(node.key)}
              aria-expanded={expanded}
              aria-controls={groupId}
              aria-label={expanded ? L.collapse(node.label) : L.expand(node.label)}
              className="rounded p-0.5 text-neutral-600 hover:bg-neutral-200"
            >
              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            </button>
          ) : (
            <span className="inline-block w-5" aria-hidden />
          )}
          {isObjective && node.href ? (
            <Link href={node.href} className="font-medium text-neutral-900 underline-offset-2 hover:underline">
              {node.label}
            </Link>
          ) : (
            <h3 className={`font-semibold text-neutral-900 ${depth === 0 ? 'text-base' : 'text-sm'}`}>{node.label}</h3>
          )}
          {!isObjective && <span className="text-xs text-neutral-500">{node.caption}</span>}
        </div>
        <div className="pl-7">
          <ReadingPair readings={node.readings} testId={node.key} />
        </div>
      </div>
      {expanded && (
        <ul id={groupId} className="mt-2 space-y-2 border-l border-neutral-200 pl-3 sm:pl-6">
          {node.children.map((child) => (
            <TreeItem key={child.key} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}
