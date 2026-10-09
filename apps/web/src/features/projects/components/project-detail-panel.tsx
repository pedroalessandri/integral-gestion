'use client';

import { useState } from 'react';
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ProjectDetailDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import type { ObjectiveIndicatorDto, ProjectContributionDto } from '@gestion-publica/shared-types/metrics';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { StatusIcon } from '@/components/objectives/status-icon';
import { TaskProgressSlider } from '@/components/objectives/task-progress-slider';
import { ProjectContributionsSection } from '@/features/contributions';
import { LABELS } from '@/lib/labels';
import { useProjectTasks } from '../useProjectTasks';
import { formatBpPercent } from '../weights';
import { DeleteProjectDialog } from './delete-project-dialog';
import { DeleteTaskDialog } from './delete-task-dialog';
import { ProjectFormDialog } from './project-form-dialog';
import { ProjectGantt } from './project-gantt';
import { TaskFormDialog } from './task-form-dialog';
import { WeightsControl } from './weights-control';

interface Props {
  orgId: string;
  objective: {
    id: string;
    title: string;
    orgUnitId: string;
    periodStartsAt: string;
    periodEndsAt: string;
  };
  project: ProjectDetailDto;
  tasks: TaskSummaryDto[];
  /** Nombre del responsable ya resuelto por la página, o null. */
  ownerName: string | null;
  /** Indicadores del objetivo (candidatos a recibir el aporte del proyecto). */
  indicators: ObjectiveIndicatorDto[];
  /** Aportes del proyecto a indicadores. */
  contributions: ProjectContributionDto[];
  /** Error al cargar indicadores o aportes; la sección lo muestra en lugar de la lista. */
  contributionsError: string | null;
  readOnly: boolean;
}

type DialogState =
  | { type: 'editProject' }
  | { type: 'deleteProject' }
  | { type: 'task'; task: TaskSummaryDto | null }
  | { type: 'deleteTask'; task: TaskSummaryDto }
  | null;

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function ProjectDetailPanel({
  orgId,
  objective,
  project,
  tasks,
  ownerName,
  indicators,
  contributions,
  contributionsError,
  readOnly,
}: Props) {
  const s = useProjectTasks(orgId, project, tasks);
  const [dialog, setDialog] = useState<DialogState>(null);

  function open(next: DialogState) {
    s.clearError();
    setDialog(next);
  }
  function close() {
    s.clearError();
    setDialog(null);
  }

  const editingTaskId = dialog?.type === 'task' && dialog.task ? dialog.task : null;
  const newTaskButton = !readOnly && (
    <Button onClick={() => open({ type: 'task', task: null })}>
      <Plus className="h-4 w-4 mr-1.5" aria-hidden />
      Nueva tarea
    </Button>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4" aria-labelledby="project-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 id="project-heading" className="text-2xl font-semibold tracking-tight text-neutral-900 break-words">
              {project.title}
            </h1>
            {project.description && <p className="text-sm text-neutral-600 whitespace-pre-line">{project.description}</p>}
            <p className="text-xs text-neutral-500">
              {formatDate(project.startsAt)} — {formatDate(project.endsAt)}
              {ownerName && <> · Responsable: {ownerName}</>}
              {project.weightBp !== null && (
                <>
                  {' '}
                  · {LABELS.weighting.weight} en el objetivo:{' '}
                  <span className="font-mono">{formatBpPercent(project.weightBp, 2)}</span>
                </>
              )}
            </p>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => open({ type: 'editProject' })}>
                <Pencil className="h-4 w-4 mr-1.5" aria-hidden />
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => open({ type: 'deleteProject' })}
              >
                <Trash2 className="h-4 w-4 mr-1.5" aria-hidden />
                Eliminar
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-neutral-700">Avance del proyecto (desde sus tareas)</span>
            <span className="font-mono font-semibold text-neutral-900">{formatBpPercent(project.progressCachedBp)}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Avance del proyecto"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(project.progressCachedBp / 100)}
            className="h-2 w-full rounded-full bg-neutral-200"
          >
            <div
              className="h-2 rounded-full bg-emerald-600"
              style={{ width: `${Math.min(100, project.progressCachedBp / 100)}%`, transition: 'width 500ms ease' }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="tasks-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="tasks-heading" className="text-lg font-semibold text-neutral-900">
            {LABELS.task.plural}
          </h2>
          {tasks.length > 0 && newTaskButton}
        </div>

        {tasks.length > 0 && (
          <WeightsControl
            noun={LABELS.task.plural.toLowerCase()}
            mode={s.weights.mode}
            items={tasks.map((t) => ({ id: t.id, label: t.title, weightBp: t.weightBp }))}
            pending={s.weights.pending}
            error={s.weights.error}
            readOnly={readOnly}
            onSave={s.weights.saveWeights}
            onClear={s.weights.clearWeights}
            onClearError={s.weights.clearError}
          />
        )}

        {tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Este proyecto todavía no tiene tareas"
            description={
              readOnly ? 'Sin tareas.' : 'Las tareas miden el avance del proyecto. Agregá la primera.'
            }
            action={newTaskButton || undefined}
          />
        ) : (
          <ul className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
            {tasks.map((task) => (
              <li key={task.id} id={`task-${task.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
                <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                  <StatusIcon status={task.status} />
                  <span className="min-w-0 break-words text-neutral-800">{task.title}</span>
                </div>
                <span className="shrink-0 text-xs text-neutral-500">
                  {formatDate(task.startsAt)} — {formatDate(task.endsAt)}
                </span>
                <span className="shrink-0 font-mono text-xs text-neutral-500" title={LABELS.weighting.weight}>
                  {task.weightBp === null ? '—' : formatBpPercent(task.weightBp, 2)}
                </span>
                <div className="flex-1 basis-48 max-w-xs">
                  {readOnly ? (
                    <span className="font-mono text-xs text-neutral-700">{formatBpPercent(task.progressBp, 0)}</span>
                  ) : (
                    <TaskProgressSlider orgId={orgId} taskId={task.id} initialProgressBp={task.progressBp} />
                  )}
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${task.title}`}
                      onClick={() => open({ type: 'task', task })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      aria-label={`Eliminar ${task.title}`}
                      onClick={() => open({ type: 'deleteTask', task })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProjectContributionsSection
        orgId={orgId}
        projectId={project.id}
        indicators={indicators}
        contributions={contributions}
        loadError={contributionsError}
        readOnly={readOnly}
      />

      {tasks.length > 0 && (
        <section className="space-y-2" aria-labelledby="gantt-heading">
          <h2 id="gantt-heading" className="text-lg font-semibold text-neutral-900">
            Cronograma
          </h2>
          <ProjectGantt
            axisStartsAt={project.startsAt}
            axisEndsAt={project.endsAt}
            objectiveId={objective.id}
            items={[{ project, tasks }]}
            tasksOnly
          />
        </section>
      )}

      {dialog?.type === 'editProject' && (
        <ProjectFormDialog
          orgId={orgId}
          project={project}
          objective={objective}
          pending={s.pending}
          error={s.error}
          onSubmit={s.updateProject}
          onClose={close}
        />
      )}
      {dialog?.type === 'deleteProject' && (
        <DeleteProjectDialog
          project={{ title: project.title, taskCount: tasks.length }}
          pending={s.pending}
          error={s.error}
          onConfirm={() => void s.deleteProject(objective.id)}
          onClose={close}
        />
      )}
      {dialog?.type === 'task' && (
        <TaskFormDialog
          orgId={orgId}
          task={editingTaskId}
          project={project}
          groupWeighted={s.weights.mode === 'weighted'}
          pending={s.pending}
          error={s.error}
          onSubmit={(values) => (editingTaskId ? s.updateTask(editingTaskId, values) : s.createTask(values))}
          onClose={close}
        />
      )}
      {dialog?.type === 'deleteTask' && (
        <DeleteTaskDialog
          task={dialog.task}
          pending={s.pending}
          error={s.error}
          onConfirm={async () => {
            if (await s.deleteTask(dialog.task)) close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
