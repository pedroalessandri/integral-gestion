import { notFound } from 'next/navigation';
import { getOrganizationAction, getAiUsageAction } from '@/components/orgs/actions';
import { getMe } from '@/lib/me';
import { OrgContextForm } from '@/components/orgs/org-context-form';
import { SectorCard } from '@/components/orgs/sector-card';
import { AiUsageCard } from '@/components/orgs/ai-usage-card';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { ModulesPanel } from '@/components/settings/modules-panel';
import { OrgStructurePanel, listOrgUnitTreeAction, listScopeMembersAction } from '@/features/org-structure';

export default async function OrgSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;

  const [orgResult, usageResult, me, treeResult, membersResult] = await Promise.all([
    getOrganizationAction(orgId),
    getAiUsageAction(orgId),
    getMe(),
    listOrgUnitTreeAction(orgId),
    listScopeMembersAction(orgId),
  ]);

  if (orgResult.error || !orgResult.organization) notFound();

  const isSuperadmin = me?.isSuperadmin === true;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Configuración de {orgResult.organization.name}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Contexto de la organización, estructura de unidades, uso del copilot AI y, para superadmins, habilitación de módulos.
        </p>
      </div>

      <SettingsTabs
        general={
          <div className="space-y-6">
            <OrgContextForm organization={orgResult.organization} />
            <SectorCard orgId={orgId} sector={orgResult.organization.sector} canEdit={isSuperadmin} />
          </div>
        }
        estructura={
          <OrgStructurePanel
            orgId={orgId}
            tree={treeResult.ok ? treeResult.data : []}
            members={membersResult.ok ? membersResult.data : []}
            loadError={treeResult.ok ? null : treeResult.error}
            membersError={membersResult.ok ? null : membersResult.error}
          />
        }
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
