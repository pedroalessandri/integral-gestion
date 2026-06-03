import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PeriodItem } from '@/components/objectives/actions';

export type { PeriodItem };

export interface PeriodSelectorProps {
  periods: PeriodItem[];
  currentPeriodId: string | undefined;
  baseHref: string;
  excludeStatuses?: Array<'open' | 'closed' | 'future'>;
}

const statusLabel: Record<PeriodItem['status'], string> = {
  open: 'Abierto',
  closed: 'Cerrado',
  future: 'Futuro',
};

export function PeriodSelector({
  periods,
  currentPeriodId,
  baseHref,
  excludeStatuses = [],
}: PeriodSelectorProps) {
  const filteredPeriods = excludeStatuses.length > 0
    ? periods.filter((p) => !excludeStatuses.includes(p.status))
    : periods;

  if (filteredPeriods.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-label="Cambiar período"
        >
          Cambiar período
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {filteredPeriods.map((p) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link
              href={`${baseHref}?periodId=${p.id}`}
              className="flex items-center justify-between gap-4"
              aria-current={p.id === currentPeriodId ? 'page' : undefined}
            >
              <span className={p.id === currentPeriodId ? 'font-medium' : ''}>{p.code}</span>
              <span
                className="text-xs"
                style={{ color: p.status === 'open' ? '#065f46' : 'var(--color-neutral-400)' }}
              >
                {statusLabel[p.status]}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
