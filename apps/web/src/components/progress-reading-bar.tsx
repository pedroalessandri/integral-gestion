interface Props {
  label: string;
  valueBp: number;
  /** Si no hay elementos que midan la lectura, se muestra este texto en vez de un 0 % engañoso. */
  hasItems: boolean;
  emptyText: string;
  barClassName: string;
  testId: string;
  className?: string;
}

/**
 * Barra de una lectura de avance (resultado o gestión). Cada lectura usa su propia instancia: nunca se combinan.
 * El valor viene calculado del backend; acá solo se redondea para mostrarlo.
 */
export function ProgressReadingBar({ label, valueBp, hasItems, emptyText, barClassName, testId, className = '' }: Props) {
  const pct = Math.max(0, Math.min(10000, valueBp)) / 100;
  return (
    <div className={`space-y-1 ${className}`} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-neutral-700">{label}</span>
        {hasItems ? (
          <span className="font-mono font-semibold text-neutral-900">{pct.toFixed(1)}%</span>
        ) : (
          <span className="text-neutral-500">{emptyText}</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasItems ? Math.round(pct) : 0}
        className="h-2 w-full rounded-full bg-neutral-200"
      >
        <div
          className={`h-2 rounded-full ${barClassName}`}
          style={{ width: `${hasItems ? pct : 0}%`, transition: 'width 500ms ease' }}
        />
      </div>
    </div>
  );
}
