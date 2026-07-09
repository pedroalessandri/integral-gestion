import { notFound } from 'next/navigation';
import { getOrganizationAction, getAiUsageAction } from '@/components/orgs/actions';
import { apiFetch } from '@/lib/api-client';
import { OrgContextForm } from '@/components/orgs/org-context-form';
import { AiUsageCard } from '@/components/orgs/ai-usage-card';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { ModulesPanel } from '@/components/settings/modules-panel';

export default async function OrgSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;

  const [orgResult, usageResult, meRes] = await Promise.all([
    getOrganizationAction(orgId),
    getAiUsageAction(orgId),
    apiFetch('/api/v1/me'),
  ]);

  if (orgResult.error || !orgResult.organization) notFound();

  let isSuperadmin = false;
  if (meRes.ok) {
    const me = (await meRes.json()) as { isSuperadmin?: boolean };
    isSuperadmin = me.isSuperadmin === true;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Configuración de {orgResult.organization.name}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Contexto de la organización, uso del copilot AI y, para superadmins, habilitación de módulos.
        </p>
      </div>

      <SettingsTabs
        general={<OrgContextForm organization={orgResult.organization} />}
        copilot={
          usageResult.usage ? (
            <AiUsageCard usage={usageResult.usage} />
          ) : (
            <div
              className="rounded-xl border p-6 text-sm"
              style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-500)' }}
            >
              Todavía no hay datos de uso del copilot AI para este mes.
            </div>
          )
        }
        modulos={isSuperadmin ? <ModulesPanel orgId={orgId} /> : null}
      />
    </div>
  );
}
