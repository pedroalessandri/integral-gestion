interface Usage {
  used: number;
  limit: number;
  percentage: number;
  resetsAt: string;
}

export function AiUsageCard({ usage }: { usage: Usage }) {
  const pct = Math.min(100, usage.percentage);
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-500';
  const resetDate = new Date(usage.resetsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-neutral-200/60 shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Uso de AI este mes</h2>
          <p className="text-sm text-neutral-500">Se reinicia el {resetDate}.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-neutral-900">{usage.used.toLocaleString('es-AR')}</div>
          <div className="text-xs text-neutral-500">de {usage.limit.toLocaleString('es-AR')} tokens</div>
        </div>
      </div>

      <div className="w-full bg-neutral-200 rounded-full h-2">
        <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-2 text-xs text-neutral-500">
        {pct.toFixed(1)}% utilizado
        {pct >= 80 && pct < 100 && <span className="text-amber-600 font-medium"> — se recomienda revisar uso</span>}
        {pct >= 100 && <span className="text-red-600 font-medium"> — cuota agotada, el copilot está deshabilitado</span>}
      </div>
    </div>
  );
}
