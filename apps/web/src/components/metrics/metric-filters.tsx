'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { MetricFrequency } from '@gestion-publica/shared-types/metrics';
import { FREQUENCY_LABELS } from './format';

type FilterKey = 'all' | MetricFrequency | 'linked';

const CHIPS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'weekly', label: FREQUENCY_LABELS.weekly },
  { key: 'biweekly', label: FREQUENCY_LABELS.biweekly },
  { key: 'monthly', label: FREQUENCY_LABELS.monthly },
  { key: 'linked', label: 'Vinculados a OKRs' },
];

/** Reads the active filter from the current searchParams. */
function activeFilter(frequency: string | null, linked: string | null): FilterKey {
  if (linked === 'okr') return 'linked';
  if (frequency === 'weekly' || frequency === 'biweekly' || frequency === 'monthly') return frequency;
  return 'all';
}

export function MetricFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = activeFilter(searchParams.get('frequency'), searchParams.get('linked'));

  function select(key: FilterKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('frequency');
    params.delete('linked');
    if (key === 'linked') params.set('linked', 'okr');
    else if (key !== 'all') params.set('frequency', key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CHIPS.map((chip) => {
        const isActive = chip.key === current;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => select(chip.key)}
            className="text-xs font-medium rounded-full px-3 py-1 border transition-colors"
            style={{
              backgroundColor: isActive ? 'var(--color-primary-50)' : 'white',
              borderColor: isActive ? 'var(--color-primary-300)' : 'var(--color-neutral-200)',
              color: isActive ? 'var(--color-primary-700)' : 'var(--color-neutral-600)',
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
