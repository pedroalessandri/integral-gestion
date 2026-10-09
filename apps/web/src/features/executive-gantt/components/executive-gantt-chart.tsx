'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Link2 } from 'lucide-react';
import type { PlanningGanttDto } from '@gestion-publica/shared-types/okr';
import { GanttAxis, getMonthBoundaryPercentages } from '@/components/gantt/gantt-axis';
import { GanttBar } from '@/components/gantt/gantt-bar';
import { ExecutiveViewToggle } from '@/components/gantt/executive-view-toggle';
import { StatusIcon } from '@/components/objectives/status-icon';
import { PendingLoadBadge } from '@/components/pending-load-badge';
import { SemaphoreBadge } from '@/components/semaphore-badge';
import { EXECUTIVE_GANTT_LABELS as L, LABELS } from '@/lib/labels';
import { useExecutiveGantt } from '../useExecutiveGantt';
import type { GanttPlanRow } from '../executive-gantt-rows';

const LEFT_WIDTH = 360;

interface Props {
  data: PlanningGanttDto;
  periodStartsAt: string;
  periodEndsAt: string;
}

const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;

export function ExecutiveGanttChart({ data, periodStartsAt, periodEndsAt }: Props) {
  const g = useExecutiveGantt(data);
  const boundaries = getMonthBoundaryPercentages(periodStartsAt, periodEndsAt);
  const collapseLabel = g.allCollapsed ? L.expandAll : L.collapseAll;
  const CollapseIcon = g.allCollapsed ? ChevronsUpDown : ChevronsDownUp;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-end gap-3 border-b border-neutral-100 px-4 py-2.5">
        <button
          type="button"
          onClick={g.toggleAllObjectives}
          disabled={!g.hasObjectives}
          title={collapseLabel}
          aria-label={collapseLabel}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300"
        >
          <CollapseIcon className="h-4 w-4" aria-hidden />
        </button>
        <ExecutiveViewToggle showTasks={g.showTasks} onToggle={g.setShowTasks} />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="sticky top-0 z-[2] flex items-stretch border-b border-neutral-200 bg-neutral-50">
            <div
              className="sticky left-0 z-[3] flex shrink-0 items-center border-r border-neutral-200 bg-neutral-50 px-3 py-2"
              style={{ width: LEFT_WIDTH, minWidth: LEFT_WIDTH }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{L.columnItem}</span>
            </div>
            <div className="min-w-0 flex-1 px-2">
              <GanttAxis periodStartsAt={periodStartsAt} periodEndsAt={periodEndsAt} />
            </div>
          </div>

          <div role="list">
            {g.rows.map((row) => (
              <RowView
                key={row.key}
                row={row}
                periodStartsAt={periodStartsAt}
                periodEndsAt={periodEndsAt}
                boundaries={boundaries}
                onToggleObjective={g.toggleObjective}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell({
  left,
  right,
  boundaries,
  highlighted = false,
  testId,
}: {
  left: ReactNode;
  right: ReactNode;
  boundaries: number[];
  highlighted?: boolean;
  testId?: string;
}) {
  const bg = highlighted ? 'bg-neutral-50' : 'bg-white';
  return (
    <div role="listitem" data-testid={testId} className={`flex items-stretch border-b border-neutral-100 ${bg}`} style={{ minHeight: 40 }}>
      <div
        className={`sticky left-0 z-[1] flex shrink-0 flex-col justify-center gap-1 border-r border-neutral-100 py-2 pr-3 ${bg}`}
        style={{ width: LEFT_WIDTH, minWidth: LEFT_WIDTH }}
      >
        {left}
      </div>
      <div className="relative min-w-0 flex-1 px-2">
        {boundaries.map((p) => (
          <div key={`mb-${p}`} aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-neutral-300" style={{ left: `${p}%` }} />
        ))}
        {right}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center">
      <span className="whitespace-nowrap border-b border-dotted border-neutral-300 text-xs leading-none text-neutral-400">{text}</span>
    </div>
  );
}

function RowView({
  row,
  periodStartsAt,
  periodEndsAt,
  boundaries,
  onToggleObjective,
}: {
  row: GanttPlanRow;
  periodStartsAt: string;
  periodEndsAt: string;
  boundaries: number[];
  onToggleObjective: (id: string) => void;
}) {
  switch (row.kind) {
    case 'objective': {
      const o = row.objective;
      const toggleLabel = row.collapsed ? L.expandObjective : L.collapseObjective;
      return (
        <Shell
          testId={`gantt-objective-${o.id}`}
          highlighted
          boundaries={boundaries}
          left={
            <div className="space-y-1.5 pl-3">
              <div className="flex items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleObjective(o.id)}
                  aria-label={`${toggleLabel}: ${o.title}`}
                  aria-expanded={!row.collapsed}
                  className="mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100"
                >
                  {row.collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                </button>
                <Link href={row.href} className="break-words text-[13px] font-semibold leading-tight text-neutral-900 hover:underline">
                  {o.title}
                </Link>
              </div>
              <p className="pl-6 text-[11px] text-neutral-500">
                {o.orgUnitName ?? L.noUnit} · {o.axisName ?? L.noAxis}
              </p>
              <div className="space-y-1 pl-6">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-neutral-600">{LABELS.resultProgress}</span>
                  <span className="font-mono text-[11px] tabular-nums text-neutral-700">{pct(o.result.progressBp)}</span>
                  <SemaphoreBadge color={o.result.semaphore} deviationBp={o.result.deviationBp} reading={LABELS.resultProgress} />
                  <PendingLoadBadge count={o.result.pendingBucketsCount} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-neutral-600">{LABELS.executionProgress}</span>
                  <span className="font-mono text-[11px] tabular-nums text-neutral-700">{pct(o.execution.progressBp)}</span>
                  <SemaphoreBadge color={o.execution.semaphore} deviationBp={o.execution.deviationBp} reading={LABELS.executionProgress} />
                </div>
              </div>
            </div>
          }
          right={
            o.startsAt && o.endsAt ? (
              // Sin relleno: el avance de cada lectura está en la columna izquierda; la barra solo marca el rango.
              <GanttBar
                periodStartsAt={periodStartsAt}
                periodEndsAt={periodEndsAt}
                itemStartsAt={o.startsAt}
                itemEndsAt={o.endsAt}
                fillBp={0}
                status="pending"
                href={row.href}
                ariaLabel={L.openObjective(o.title)}
              />
            ) : null
          }
        />
      );
    }
    case 'no-projects':
      return (
        <Shell
          boundaries={boundaries}
          left={<span className="pl-12 text-xs italic text-neutral-400">{L.noProjects}</span>}
          right={<Placeholder text={L.noProjects} />}
        />
      );
    case 'project': {
      const p = row.project;
      return (
        <Shell
          testId={`gantt-project-${p.id}`}
          boundaries={boundaries}
          left={
            <div className="space-y-0.5 pl-9">
              <Link href={row.href} className="break-words text-[13px] leading-tight text-neutral-900 hover:underline">
                {p.title}
              </Link>
              <p className="text-[11px] text-neutral-500">{p.orgUnitName}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusIcon status={row.status} />
                <span className="text-[11px] tabular-nums text-neutral-500">
                  {L.progress} {pct(p.progressBp)}
                </span>
                {row.fromIndicator && (
                  <span
                    title={L.fromIndicatorHint}
                    className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800"
                  >
                    <Link2 className="h-3 w-3" aria-hidden />
                    {L.fromIndicator}
                  </span>
                )}
              </div>
            </div>
          }
          right={
            <GanttBar
              periodStartsAt={periodStartsAt}
              periodEndsAt={periodEndsAt}
              itemStartsAt={p.startsAt}
              itemEndsAt={p.endsAt}
              fillBp={p.progressBp}
              status={row.status}
              href={row.href}
              ariaLabel={`${LABELS.project.singular}: ${p.title}`}
            />
          }
        />
      );
    }
    case 'no-tasks':
      return (
        <Shell
          boundaries={boundaries}
          left={<span className="pl-16 text-[11px] italic text-neutral-400">{L.noTasks}</span>}
          right={null}
        />
      );
    case 'task': {
      const t = row.task;
      return (
        <Shell
          testId={`gantt-task-${t.id}`}
          boundaries={boundaries}
          left={
            <div className="space-y-0.5 pl-16">
              <Link href={row.href} className="break-words text-[13px] leading-tight text-neutral-800 hover:underline">
                {t.title}
              </Link>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusIcon status={t.status} />
                <span className="text-[11px] tabular-nums text-neutral-500">{pct(t.progressBp)}</span>
                {row.informative && (
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600" title={L.tasksInformativeNote}>
                    {L.informativeTask}
                  </span>
                )}
              </div>
            </div>
          }
          right={
            <GanttBar
              periodStartsAt={periodStartsAt}
              periodEndsAt={periodEndsAt}
              itemStartsAt={t.startsAt}
              itemEndsAt={t.endsAt}
              fillBp={t.progressBp}
              status={t.status}
              href={row.href}
              ariaLabel={`${LABELS.task.singular}: ${t.title}`}
            />
          }
        />
      );
    }
  }
}
