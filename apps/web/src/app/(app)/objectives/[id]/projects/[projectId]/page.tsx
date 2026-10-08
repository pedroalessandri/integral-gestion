import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Lock as LockIcon } from 'lucide-react';
import { getActiveOrgId } from '@/lib/active-org';
import { loadOrgMembersAction } from '@/components/objectives/actions';
import {
  ProjectDetailPanel,
  getObjectiveAction,
  getProjectAction,
  listProjectTasksAction,
} from '@/features/projects';

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="max-w-4xl">
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{message}</p>
      </div>
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}) {
  const { id, projectId } = await params;
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const [objectiveResult, projectResult, tasksResult] = await Promise.all([
    getObjectiveAction(orgId, id),
    getProjectAction(orgId, projectId),
    listProjectTasksAction(orgId, projectId),
  ]);

  if (!projectResult.ok && projectResult.status === 404) notFound();
  if (!objectiveResult.ok) return <ErrorBox message={objectiveResult.error} />;
  if (!projectResult.ok) return <ErrorBox message={projectResult.error} />;
  if (!tasksResult.ok) return <ErrorBox message={tasksResult.error} />;

  const objective = objectiveResult.data;
  const project = projectResult.data;
  if (project.objectiveId !== objective.id) notFound();

  const { startsAt: periodStartsAt, endsAt: periodEndsAt } = objective.period;
  if (!periodStartsAt || !periodEndsAt) {
    return <ErrorBox message="No pudimos obtener las fechas del período del objetivo. Recargá la página." />;
  }

  let ownerName: string | null = null;
  if (project.ownerUserId) {
    const { members } = await loadOrgMembersAction({ orgId });
    ownerName = members.find((m) => m.id === project.ownerUserId)?.displayName ?? null;
  }
  const isReadOnly = objective.period.status !== 'open';

  return (
    <div className="space-y-6 max-w-5xl">
      {isReadOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <LockIcon className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Período cerrado</h3>
            <p className="text-sm text-amber-800 mt-1">
              Este proyecto pertenece a un período cerrado. Los valores son solo de lectura.
            </p>
          </div>
        </div>
      )}
      <nav aria-label="Ubicación" className="text-sm">
        <Link href={`/objectives/${objective.id}`} className="font-medium" style={{ color: 'var(--color-primary-600)' }}>
          ← {objective.title}
        </Link>
      </nav>
      <ProjectDetailPanel
        orgId={orgId}
        objective={{
          id: objective.id,
          title: objective.title,
          orgUnitId: objective.orgUnitId,
          periodStartsAt,
          periodEndsAt,
        }}
        project={project}
        tasks={tasksResult.data}
        ownerName={ownerName}
        readOnly={isReadOnly}
      />
    </div>
  );
}
