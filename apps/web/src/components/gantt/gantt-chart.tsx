'use client';

import { useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type { ObjectiveGanttDto } from '@gestion-publica/shared-types/okr';
import { GanttAxis, getMonthBoundaryPercentages } from './gantt-axis';
import { GanttRow } from './gantt-row';
import { ExecutiveViewToggle } from './executive-view-toggle';

export interface GanttChartProps {
  periodStartsAt: string;
  periodEndsAt: string;
  objectives: ObjectiveGanttDto[];
}

export function GanttChart({ periodStartsAt, periodEndsAt, objectives }: GanttChartProps) {
  const [showTasks, setShowTasks] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const hasObjectives = objectives.length > 0;
  const allCollapsed = hasObjectives && collapsedIds.size === objectives.length;
  const monthBoundaryPcts = getMonthBoundaryPercentages(periodStartsAt, periodEndsAt);

  function toggleObjective(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setCollapsedIds((prev) => {
      if (prev.size === objectives.length) return new Set();
      return new Set(objectives.map((o) => o.id));
    });
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 12,
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}
    >
      {/* Card header: toggles */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid var(--color-neutral-100)',
          backgroundColor: 'white',
        }}
      >
        <CollapseAllButton
          allCollapsed={allCollapsed}
          disabled={!hasObjectives}
          onClick={toggleAll}
        />
        <ExecutiveViewToggle showTasks={showTasks} onToggle={setShowTasks} />
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto' }}>
        {/* Axis header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid var(--color-neutral-200)',
            backgroundColor: 'var(--color-neutral-50)',
            position: 'sticky',
            top: 0,
            zIndex: 2,
          }}
        >
          {/* Left column header */}
          <div
            style={{
              width: 280,
              minWidth: 280,
              flexShrink: 0,
              position: 'sticky',
              left: 0,
              backgroundColor: 'var(--color-neutral-50)',
              zIndex: 3,
              borderRight: '1px solid var(--color-neutral-200)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-neutral-500)',
              }}
            >
              Ítem
            </span>
          </div>

          {/* Right column: axis */}
          <div style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
            <GanttAxis periodStartsAt={periodStartsAt} periodEndsAt={periodEndsAt} />
          </div>
        </div>

        {/* Body rows */}
        <div>
          {objectives.map((obj) => {
            const objHref = `/objectives/${obj.id}`;
            const hasKrsWithDates = obj.keyResults.some((kr) => kr.startsAt !== null);
            const isCollapsed = collapsedIds.has(obj.id);

            return (
              <div key={obj.id}>
                {/* Objective row */}
                <GanttRow
                  title={obj.title}
                  href={objHref}
                  status={obj.status}
                  progressBp={obj.progressCachedBp}
                  indentPx={0}
                  isObjectiveRow={true}
                  ganttBar={
                    obj.startsAt && obj.endsAt
                      ? {
                          periodStartsAt,
                          periodEndsAt,
                          itemStartsAt: obj.startsAt,
                          itemEndsAt: obj.endsAt,
                          fillBp: obj.progressCachedBp,
                          barHref: objHref,
                        }
                      : null
                  }
                  placeholder={
                    obj.keyResults.length === 0 || !hasKrsWithDates
                      ? 'Sin Resultados Clave con tareas'
                      : 'Sin Resultados Clave con tareas'
                  }
                  collapsible={{
                    collapsed: isCollapsed,
                    onToggle: () => toggleObjective(obj.id),
                  }}
                  monthBoundaryPcts={monthBoundaryPcts}
                />

                {/* KR rows — hidden when the objective is collapsed */}
                {!isCollapsed && obj.keyResults.map((kr) => {
                  const krHref = `/objectives/${obj.id}#kr-${kr.id}`;

                  return (
                    <div key={kr.id}>
                      <GanttRow
                        title={kr.title}
                        href={krHref}
                        status={kr.status}
                        progressBp={kr.progressCachedBp}
                        indentPx={24}
                        isObjectiveRow={false}
                        ganttBar={
                          kr.startsAt && kr.endsAt
                            ? {
                                periodStartsAt,
                                periodEndsAt,
                                itemStartsAt: kr.startsAt,
                                itemEndsAt: kr.endsAt,
                                fillBp: kr.progressCachedBp,
                                barHref: krHref,
                              }
                            : null
                        }
                        placeholder="Sin tareas"
                        monthBoundaryPcts={monthBoundaryPcts}
                      />

                      {/* Task rows (only when showTasks is true) */}
                      {showTasks && (
                        <>
                          {kr.tasks.length === 0 ? (
                            /* KR has no tasks at all — show placeholder row */
                            <NoTasksPlaceholderRow monthBoundaryPcts={monthBoundaryPcts} />
                          ) : (
                            kr.tasks.map((task) => {
                              const taskHref = `/objectives/${obj.id}#task-${task.id}`;
                              const hasValidDates =
                                task.startsAt && task.endsAt;

                              return (
                                <GanttRow
                                  key={task.id}
                                  title={task.title}
                                  href={taskHref}
                                  status={task.status}
                                  progressBp={task.progressBp}
                                  indentPx={48}
                                  isObjectiveRow={false}
                                  ganttBar={
                                    hasValidDates
                                      ? {
                                          periodStartsAt,
                                          periodEndsAt,
                                          itemStartsAt: task.startsAt,
                                          itemEndsAt: task.endsAt,
                                          fillBp: task.progressBp,
                                          barHref: taskHref,
                                        }
                                      : null
                                  }
                                  placeholder="Sin fechas — corregir tarea"
                                  monthBoundaryPcts={monthBoundaryPcts}
                                />
                              );
                            })
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CollapseAllButtonProps {
  allCollapsed: boolean;
  disabled: boolean;
  onClick: () => void;
}

/** Icon-only toggle in the chart header. Tooltip flips between
 *  "Colapsar" and "Expandir" depending on current state. */
function CollapseAllButton({ allCollapsed, disabled, onClick }: CollapseAllButtonProps) {
  const label = allCollapsed ? 'Expandir' : 'Colapsar';
  const Icon = allCollapsed ? ChevronsUpDown : ChevronsDownUp;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        padding: 0,
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 6,
        background: 'white',
        color: disabled ? 'var(--color-neutral-300)' : 'var(--color-neutral-600)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 150ms ease, color 150ms ease',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
          'var(--color-neutral-50)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-neutral-800)';
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-neutral-600)';
      }}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

/** Placeholder row shown under a KR when it has no tasks (showTasks=true). */
function NoTasksPlaceholderRow({ monthBoundaryPcts }: { monthBoundaryPcts: number[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--color-neutral-100)',
        backgroundColor: 'white',
        minHeight: 28,
      }}
    >
      <div
        style={{
          width: 280,
          minWidth: 280,
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          backgroundColor: 'white',
          zIndex: 1,
          borderRight: '1px solid var(--color-neutral-100)',
          paddingLeft: 60,
          paddingRight: 12,
          paddingTop: 4,
          paddingBottom: 4,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-neutral-300)', fontStyle: 'italic' }}>
          Sin tareas asignadas
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          paddingLeft: 8,
          paddingRight: 8,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {monthBoundaryPcts.map((pct) => (
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
            }}
          />
        ))}
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-neutral-300)',
            borderBottom: '1px dotted var(--color-neutral-300)',
            lineHeight: '1',
          }}
        />
      </div>
    </div>
  );
}
