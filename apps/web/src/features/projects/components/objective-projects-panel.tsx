'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ProjectSummaryDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { StatusIcon } from '@/components/objectives/status-icon';
import { LABELS } from '@/lib/labels';
import { useObjectiveProjects } from '../useObjectiveProjects';
import { projectDisplayStatus } from '../status';
import { formatBpPercent } from '../weights';
import { DeleteProjectDialog } from './delete-project-dialog';
import { ProjectFormDialog } from './project-form-dialog';
import { ProjectGantt } from './project-gantt';
import { WeightsControl } from './weights-control';

interface Props {
  orgId: string;
  objective: {
    id: string;
    orgUnitId: string;
    periodStartsAt: string;
    periodEndsAt: string;
  };
  projects: ProjectSummaryDto[];
  tasksByProject: Record<string, TaskSummaryDto[]>;
  /** Período cerrado: solo lectura. */
  readOnly: boolean;
  loadError?: string | null;
}

type DialogState =
  | { type: 'create' }
  | { type: 'delete'; project: ProjectSummaryDto }
  | null;

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function ObjectiveProjectsPanel({ orgId, objective, projects, tasksByProject, readOnly, loadError }: Props) {
  const s = useObjectiveProjects(orgId, objective, projects);
  const [dialog, setDialog] = useState<DialogState>(null);

  function open(next: DialogState) {
    s.clearError();
    setDialog(next);
  }
  function close() {
    s.clearError();
    setDialog(null);
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border p-4 bg-red-50 border-red-200">
        <p className="text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  const newButton = !readOnly && (
    <Button onClick={() => open({ type: 'create' })}>
      <Plus className="h-4 w-4 mr-1.5" aria-hidden />
      Nuevo proyecto
    </Button>
  );

  return (
    <div className="space-y-5">
      {s.notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3">
          <p className="text-sm text-neutral-700">{s.notice}</p>
          <Button variant="ghost" size="sm" onClick={s.dismissNotice}>
            Cerrar
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aún no hay proyectos"
          description={
            readOnly
              ? 'Este objetivo no tiene proyectos.'
              : 'Los proyectos y sus tareas miden el avance de gestión del objetivo. Creá el primero.'
          }
          action={newButton || undefined}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <WeightsControl
              noun={LABELS.project.plural.toLowerCase()}
              mode={s.weights.mode}
              items={projects.map((p) => ({ id: p.id, label: p.title, weightBp: p.weightBp }))}
              pending={s.weights.pending}
              error={s.weights.error}
              readOnly={readOnly}
              onSave={s.weights.saveWeights}
              onClear={s.weights.clearWeights}
              onClearError={s.weights.clearError}
            />
            {newButton}
          </div>

          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={projectDisplayStatus(project)} />
                      <Link
                        href={`/objectives/${objective.id}/projects/${project.id}`}
                        className="font-medium text-neutral-900 hover:underline break-words"
                      >
                        {project.title}
                      </Link>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {formatDate(project.startsAt)} — {formatDate(project.endsAt)} · {project.taskCount}{' '}
                      {project.taskCount === 1 ? 'tarea' : 'tareas'}
                      {project.weightBp !== null && (
                        <>
                          {' '}
                          · {LABELS.weighting.weight}:{' '}
                          <span className="font-mono">{formatBpPercent(project.weightBp, 2)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-semibold text-neutral-900">
                      {formatBpPercent(project.progressCachedBp)}
                    </span>
                    {!readOnly && (
                      <>
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/objectives/${objective.id}/projects/${project.id}`}
                            aria-label={`Editar ${project.title}`}
                            title="Abrir la ficha para editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          aria-label={`Eliminar ${project.title}`}
                          onClick={() => open({ type: 'delete', project })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-200" aria-hidden>
                  <div
                    className="h-1.5 rounded-full bg-emerald-600"
                    style={{ width: `${Math.min(100, project.progressCachedBp / 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <section className="space-y-2" aria-labelledby="projects-gantt-heading">
            <h3 id="projects-gantt-heading" className="text-sm font-semibold text-neutral-900">
              Cronograma
            </h3>
            <ProjectGantt
              axisStartsAt={objective.periodStartsAt}
              axisEndsAt={objective.periodEndsAt}
              objectiveId={objective.id}
              items={projects.map((project) => ({ project, tasks: tasksByProject[project.id] ?? [] }))}
            />
          </section>
        </>
      )}

      {dialog?.type === 'create' && (
        <ProjectFormDialog
          orgId={orgId}
          project={null}
          objective={objective}
          pending={s.pending}
          error={s.error}
          onSubmit={s.createProject}
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteProjectDialog
          project={dialog.project}
          pending={s.pending}
          error={s.error}
          onConfirm={async () => {
            if (await s.deleteProject(dialog.project)) close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
