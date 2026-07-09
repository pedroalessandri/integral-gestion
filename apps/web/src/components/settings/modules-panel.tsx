'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listModulesAction, enableModuleAction, disableModuleAction, type OrgModuleInfo } from './actions';

interface KnownModule {
  key: string;
  label: string;
  description: string;
  /** Module key that must be enabled first. */
  requires?: string;
}

const KNOWN_MODULES: KnownModule[] = [
  {
    key: 'indicadores-gestion',
    label: 'Indicadores de gestión',
    description: 'Catálogo de indicadores por organización, carga periódica y visualización esperado vs. real.',
  },
  {
    key: 'indicadores-okr',
    label: 'Indicadores en OKRs',
    description: 'Vincular indicadores a Key Results con progreso automático.',
    requires: 'indicadores-gestion',
  },
];

function isEnabled(modules: OrgModuleInfo[], key: string): boolean {
  return modules.some((m) => m.moduleKey === key && m.disabledAt === null);
}

export function ModulesPanel({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [modules, setModules] = useState<OrgModuleInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function applyResult(result: { error?: string; modules?: OrgModuleInfo[] }) {
    if (result.error) {
      setLoadError(result.error);
      setModules([]);
      return;
    }
    setLoadError(null);
    setModules(result.modules ?? []);
  }

  // Load on mount / org change. The .then callback keeps setState out of the
  // effect body (avoids the cascading-render lint rule).
  useEffect(() => {
    let cancelled = false;
    listModulesAction({ orgId }).then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function toggle(key: string, currentlyEnabled: boolean) {
    setPendingKey(key);
    setActionError(null);
    const result = currentlyEnabled
      ? await disableModuleAction({ orgId, moduleKey: key })
      : await enableModuleAction({ orgId, moduleKey: key });
    if (result.error) {
      setActionError(result.error);
      setPendingKey(null);
      return;
    }
    applyResult(await listModulesAction({ orgId }));
    setPendingKey(null);
    // Refresh server components (layout /me) so the nav reflects the change.
    router.refresh();
  }

  // Loading skeleton — never render a blank panel while fetching.
  if (modules === null) {
    return (
      <div className="space-y-3 animate-pulse">
        {KNOWN_MODULES.map((m) => (
          <div
            key={m.key}
            className="rounded-lg border p-4 flex items-center justify-between gap-4"
            style={{ borderColor: 'var(--color-neutral-200)' }}
          >
            <div className="space-y-2 flex-1">
              <div className="h-4 w-40 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
              <div className="h-3 w-64 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
            </div>
            <div className="h-6 w-11 rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
        Los módulos apagados desaparecen de la navegación de la organización.
      </p>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-red-700 text-sm">{loadError}</p>
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-red-700 text-sm">{actionError}</p>
        </div>
      )}

      <div className="space-y-3">
        {KNOWN_MODULES.map((mod) => {
          const enabled = isEnabled(modules, mod.key);
          const dependencyMet = !mod.requires || isEnabled(modules, mod.requires);
          const blocked = !enabled && !dependencyMet;
          const pending = pendingKey === mod.key;

          return (
            <div
              key={mod.key}
              className="rounded-lg border p-4 flex items-center justify-between gap-4"
              style={{
                borderColor: 'var(--color-neutral-200)',
                opacity: blocked ? 0.6 : 1,
              }}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: 'var(--color-neutral-900)' }}>
                  {mod.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
                  {mod.description}
                </p>
                {blocked && (
                  <p className="text-xs font-medium" style={{ color: '#b45309' }}>
                    Requiere Indicadores de gestión
                  </p>
                )}
              </div>
              <Toggle
                checked={enabled}
                disabled={blocked || pending}
                onChange={() => toggle(mod.key, enabled)}
                label={`${enabled ? 'Desactivar' : 'Activar'} ${mod.label}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
      style={{
        backgroundColor: checked ? 'var(--color-primary-600)' : 'var(--color-neutral-300)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}
