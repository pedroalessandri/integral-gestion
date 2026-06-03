'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock } from 'lucide-react';
import { setActiveOrgAction } from '@/lib/set-active-org-action';

const MODULE_ROUTES: Record<string, string> = {
  okr: '/objectives',
};

interface Props {
  orgId: string;
  moduleKey: string;
  moduleName: string;
}

export function ModuleChip({ orgId, moduleKey, moduleName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hover, setHover] = useState(false);
  const href = MODULE_ROUTES[moduleKey];

  if (!href) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-not-allowed"
        style={{
          backgroundColor: 'var(--color-neutral-100)',
          color: 'var(--color-neutral-500)',
          border: '1px solid var(--color-neutral-200)',
        }}
        title="Próximamente"
      >
        <Clock className="w-3 h-3" aria-hidden="true" />
        {moduleName}
      </span>
    );
  }

  function handleClick() {
    if (isPending) return;
    startTransition(async () => {
      await setActiveOrgAction(orgId);
      router.push(href);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60"
      style={{
        backgroundColor: hover ? 'var(--color-primary-100)' : 'var(--color-primary-50)',
        color: 'var(--color-primary-700)',
        border: '1px solid var(--color-primary-100)',
      }}
    >
      {moduleName}
      <ArrowRight className="w-3 h-3" aria-hidden="true" />
    </button>
  );
}
