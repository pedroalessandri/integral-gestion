'use client';

import { useState } from 'react';
import type { ProjectSummaryDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import { GanttAxis, getMonthBoundaryPercentages } from '@/components/gantt/gantt-axis';
import { GanttRow } from '@/components/gantt/gantt-row';
import { ExecutiveViewToggle } from '@/components/gantt/executive-view-toggle';
import { projectDisplayStatus } from '../status';

export interface ProjectGanttItem {
  project: ProjectSummaryDto;
  tasks: TaskSummaryDto[];
}

interface Props {
  /** Rango del eje: el período del objetivo (ficha del objetivo) o las fechas del proyecto (ficha del proyecto). */
  axisStartsAt: string;
  axisEndsAt: string;
  items: ProjectGanttItem[];
  objectiveId: string;
  initialShowTasks?: boolean;
  /** Ocultar el toggle y la fila del proyecto cuando el Gantt es de un único proyecto. */
  tasksOnly?: boolean;
}

/** Gantt proyecto → tareas. Reusa los bloques del Gantt ejecutivo (eje, filas y barras). */
export function ProjectGantt({
  axisStartsAt,
  axisEndsAt,
  items,
  objectiveId,
  initialShowTasks = false,
  tasksOnly = false,
}: Props) {
  const [showTasks, setShowTasks] = useState(initialShowTasks || tasksOnly);
  const monthBoundaryPcts = getMonthBoundaryPercentages(axisStartsAt, axisEndsAt);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {!tasksOnly && (
        <div className="flex items-center justify-end border-b border-neutral-100 px-4 py-2.5">
          <ExecutiveViewToggle showTasks={showTasks} onToggle={setShowTasks} />
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid var(--color-neutral-200)',
            backgroundColor: 'var(--color-neutral-50)',
          }}
        >
          <div
            style={{
              width: 280,
              minWidth: 280,
              flexShrink: 0,
              borderRight: '1px solid var(--color-neutral-200)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-neutral-500)',
            }}
          >
            {tasksOnly ? 'Tarea' : 'Proyecto / tarea'}
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
            <GanttAxis periodStartsAt={axisStartsAt} periodEndsAt={axisEndsAt} />
          </div>
        </div>

        {items.map(({ project, tasks }) => {
          const projectHref = `/objectives/${objectiveId}/projects/${project.id}`;
          return (
            <div key={project.id}>
              {!tasksOnly && (
                <GanttRow
                  title={project.title}
                  href={projectHref}
                  status={projectDisplayStatus(project)}
                  progressBp={project.progressCachedBp}
                  indentPx={0}
                  isObjectiveRow
                  ganttBar={{
                    periodStartsAt: axisStartsAt,
                    periodEndsAt: axisEndsAt,
                    itemStartsAt: project.startsAt,
                    itemEndsAt: project.endsAt,
                    fillBp: project.progressCachedBp,
                    barHref: projectHref,
                  }}
                  placeholder="Sin fechas"
                  monthBoundaryPcts={monthBoundaryPcts}
                />
              )}
              {showTasks &&
                tasks.map((task) => {
                  const taskHref = tasksOnly ? `#task-${task.id}` : `${projectHref}#task-${task.id}`;
                  return (
                    <GanttRow
                      key={task.id}
                      title={task.title}
                      href={taskHref}
                      status={task.status}
                      progressBp={task.progressBp}
                      indentPx={tasksOnly ? 0 : 24}
                      isObjectiveRow={false}
                      ganttBar={{
                        periodStartsAt: axisStartsAt,
                        periodEndsAt: axisEndsAt,
                        itemStartsAt: task.startsAt,
                        itemEndsAt: task.endsAt,
                        fillBp: task.progressBp,
                        barHref: taskHref,
                      }}
                      placeholder="Sin fechas"
                      monthBoundaryPcts={monthBoundaryPcts}
                    />
                  );
                })}
              {showTasks && tasks.length === 0 && !tasksOnly && (
                <p className="border-b border-neutral-100 py-1.5 pl-[60px] text-xs italic text-neutral-400">
                  Sin tareas
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
