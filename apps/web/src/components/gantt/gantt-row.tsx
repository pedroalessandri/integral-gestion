import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { StatusIcon } from '@/components/objectives/status-icon';
import { GanttBar } from './gantt-bar';
import type { ProgressStatus, TaskStatus } from '@gestion-publica/shared-types/okr';

export interface GanttRowProps {
  title: string;
  href: string;
  status: ProgressStatus | TaskStatus;
  /** For Objectives and KRs: progressCachedBp. For Tasks: progressBp. Both 0..10000. */
  progressBp: number;
  /** Left padding in pixels. Objective: 0, KR: 24, Task: 48. */
  indentPx: number;
  /** Is this an Objective row? Determines background color. */
  isObjectiveRow: boolean;

  /** Gantt bar data. Null means no dates → show placeholder instead. */
  ganttBar: {
    periodStartsAt: string;
    periodEndsAt: string;
    itemStartsAt: string;
    itemEndsAt: string;
    fillBp: number;
    barHref: string;
  } | null;

  /** Placeholder text when ganttBar is null. */
  placeholder: string;

  /**
   * When present, renders a chevron button before the title so the user can
   * collapse/expand the row's children (KRs + tasks). Only used on objective
   * rows from the executive view.
   */
  collapsible?: {
    collapsed: boolean;
    onToggle: () => void;
  };

  /**
   * Optional list of horizontal positions (in % of the right-column width)
   * where month boundaries fall inside the period. Used to draw vertical
   * guide lines through the chart body so the user can tell which month a
   * given x-position belongs to without having to look at the axis header.
   */
  monthBoundaryPcts?: number[];
}

export function GanttRow({
  title,
  href,
  status,
  progressBp,
  indentPx,
  isObjectiveRow,
  ganttBar,
  placeholder,
  collapsible,
  monthBoundaryPcts,
}: GanttRowProps) {
  const progressPct = (progressBp / 100).toFixed(1);
  const rowBg = isObjectiveRow ? 'var(--color-neutral-50)' : 'white';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--color-neutral-100)',
        backgroundColor: rowBg,
        minHeight: 40,
      }}
    >
      {/* Left column: sticky, ~280px */}
      <div
        style={{
          width: 280,
          minWidth: 280,
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          backgroundColor: rowBg,
          zIndex: 1,
          borderRight: '1px solid var(--color-neutral-100)',
          paddingLeft: indentPx + 12,
          paddingRight: 12,
          paddingTop: 8,
          paddingBottom: 8,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {collapsible && (
            <button
              type="button"
              onClick={collapsible.onToggle}
              aria-label={collapsible.collapsed ? 'Expandir objetivo' : 'Colapsar objetivo'}
              aria-expanded={!collapsible.collapsed}
              title={collapsible.collapsed ? 'Expandir' : 'Colapsar'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                padding: 0,
                marginLeft: -2,
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                color: 'var(--color-neutral-500)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--color-neutral-100)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              {collapsible.collapsed ? (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          )}
          <Link
            href={href}
            style={{
              fontSize: 13,
              fontWeight: isObjectiveRow ? 600 : 400,
              color: 'var(--color-neutral-900)',
              textDecoration: 'none',
              lineHeight: '1.3',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusIcon status={status} />
          <span
            style={{
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-neutral-500)',
            }}
          >
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Right column: scrollable */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          paddingLeft: 8,
          paddingRight: 8,
        }}
      >
        {monthBoundaryPcts?.map((pct) => (
          <div
            key={`mb-${pct}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${pct}%`,
              width: 1,
              backgroundColor: 'var(--color-neutral-300)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        ))}
        {ganttBar ? (
          <GanttBar
            periodStartsAt={ganttBar.periodStartsAt}
            periodEndsAt={ganttBar.periodEndsAt}
            itemStartsAt={ganttBar.itemStartsAt}
            itemEndsAt={ganttBar.itemEndsAt}
            fillBp={ganttBar.fillBp}
            status={status}
            href={ganttBar.barHref}
            ariaLabel={`Ver detalle de ${title}`}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-neutral-300)',
                borderBottom: '1px dotted var(--color-neutral-300)',
                lineHeight: '1',
                whiteSpace: 'nowrap',
              }}
            >
              {placeholder}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
