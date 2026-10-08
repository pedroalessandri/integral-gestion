import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import type { SemaphoreColor } from '@gestion-publica/shared-types/metrics';
import { formatDeviationPoints } from '@/lib/format-deviation';
import { DEVIATION_LABELS, SEMAPHORE_LABELS } from '@/lib/labels';

const STYLES: Record<SemaphoreColor, { className: string; Icon: typeof CheckCircle2 }> = {
  green: { className: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  yellow: { className: 'border-amber-300 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  red: { className: 'border-red-200 bg-red-50 text-red-800', Icon: XCircle },
};

interface Props {
  /** `null` = sin datos para medir el desvío. */
  color: SemaphoreColor | null;
  /** Desvío en bp, firmado (positivo = adelantado). */
  deviationBp: number | null;
  /** A qué lectura corresponde, para el lector de pantalla y el tooltip (ej: "Avance de resultado"). */
  reading: string;
  testId?: string;
}

/**
 * Semáforo del desvío de UNA lectura (RN-P9). El color nunca va solo: lleva texto e ícono. Cada lectura usa su propia
 * instancia, junto a su barra: no se combinan en un único semáforo.
 */
export function SemaphoreBadge({ color, deviationBp, reading, testId }: Props) {
  if (color === null || deviationBp === null) {
    return (
      <span
        data-testid={testId}
        title={DEVIATION_LABELS.noDataHint}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600"
      >
        <CircleDashed className="h-3 w-3" aria-hidden />
        {DEVIATION_LABELS.noData}
      </span>
    );
  }
  const { className, Icon } = STYLES[color];
  const points = formatDeviationPoints(deviationBp);
  return (
    <span
      data-testid={testId}
      title={`${reading}: ${SEMAPHORE_LABELS[color]}. ${DEVIATION_LABELS.deviation} contra lo esperado: ${points}.`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span>{SEMAPHORE_LABELS[color]}</span>
      <span className="font-mono font-normal">{points}</span>
    </span>
  );
}
