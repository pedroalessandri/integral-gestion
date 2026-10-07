import { LABELS } from '@/lib/labels';
import { formatBpPercent } from '../weights';

interface Props {
  valueBp: number;
  projectCount: number;
  /** Para distinguirla de otras barras en la misma pantalla. */
  className?: string;
}

/**
 * Barra "Avance de gestión" (desde proyectos, RN-P8). Va sola: nunca se combina con el avance de resultado.
 * El porcentaje viene calculado del backend; acá solo se redondea para mostrarlo.
 */
export function ExecutionProgressBar({ valueBp, projectCount, className = '' }: Props) {
  const pct = Math.max(0, Math.min(10000, valueBp)) / 100;
  return (
    <div className={`space-y-1 ${className}`} data-testid="execution-progress">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-neutral-700">{LABELS.executionProgress}</span>
        {projectCount === 0 ? (
          <span className="text-neutral-500">Sin proyectos todavía</span>
        ) : (
          <span className="font-mono font-semibold text-neutral-900">{formatBpPercent(valueBp)}</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={LABELS.executionProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2 w-full rounded-full bg-neutral-200"
      >
        <div
          className="h-2 rounded-full bg-emerald-600"
          style={{ width: `${projectCount === 0 ? 0 : pct}%`, transition: 'width 500ms ease' }}
        />
      </div>
    </div>
  );
}
