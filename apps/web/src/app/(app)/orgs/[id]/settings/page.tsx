import { notFound } from 'next/navigation';
import { getOrganizationAction, getAiUsageAction } from '@/components/orgs/actions';
import { OrgContextForm } from '@/components/orgs/org-context-form';
import { AiUsageCard } from '@/components/orgs/ai-usage-card';

export default async function OrgSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;

  const [orgResult, usageResult] = await Promise.all([
    getOrganizationAction(orgId),
    getAiUsageAction(orgId),
  ]);

  if (orgResult.error || !orgResult.organization) notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Configuración de {orgResult.organization.name}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Contexto organizacional que el copilot AI usa para redactar y validar objetivos.
        </p>
      </div>

      <OrgContextForm organization={orgResult.organization} />

      {usageResult.usage && <AiUsageCard usage={usageResult.usage} />}
    </div>
  );
}
