import { CalendarClock } from 'lucide-react';
import { PENDING_LOAD_LABELS } from '@/lib/labels';

interface Props {
  /** Cantidad de intervalos vencidos sin carga (RN-P15). Con 0 no se muestra nada. */
  count: number;
  /** Detalle opcional (ej: fechas de los intervalos) para el tooltip. */
  detail?: string;
  testId?: string;
}

export function PendingLoadBadge({ count, detail, testId }: Props) {
  if (count <= 0) return null;
  const label = count === 1 ? PENDING_LOAD_LABELS.one : PENDING_LOAD_LABELS.many(count);
  return (
    <span
      data-testid={testId}
      title={detail ? `${PENDING_LOAD_LABELS.hint} ${detail}` : PENDING_LOAD_LABELS.hint}
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
    >
      <CalendarClock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
