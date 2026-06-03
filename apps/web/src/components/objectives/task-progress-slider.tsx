'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setTaskProgressAction } from './actions';

interface TaskProgressSliderProps {
  orgId: string;
  taskId: string;
  initialProgressBp: number;
}

export function TaskProgressSlider({ orgId, taskId, initialProgressBp }: TaskProgressSliderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localBp, setLocalBp] = useState(initialProgressBp);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localPct = localBp / 100;
  const dirty = localBp !== initialProgressBp;
  const isDone = initialProgressBp >= 10000;

  async function handleSave(bp: number) {
    setSaving(true);
    setError(null);
    const result = await setTaskProgressAction({ orgId, taskId, progressBp: bp });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleMarkDone() {
    setLocalBp(10000);
    await handleSave(10000);
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <input
        type="range"
        min="0"
        max="10000"
        step="100"
        value={localBp}
        onChange={(e) => setLocalBp(parseInt(e.target.value))}
        disabled={saving || isPending || isDone}
        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
        style={{
          background: `linear-gradient(to right, var(--color-primary-500) 0%, var(--color-primary-600) ${Math.min(100, localPct)}%, var(--color-neutral-200) ${Math.min(100, localPct)}%, var(--color-neutral-200) 100%)`,
          accentColor: 'var(--color-primary-600)',
          transition: 'background 150ms ease',
        }}
      />
      <span
        className="text-xs font-mono w-10 text-right shrink-0"
        style={{ color: 'var(--color-primary-600)' }}
      >
        {localPct.toFixed(0)}%
      </span>
      {dirty && !isDone && (
        <Button
          size="sm"
          onClick={() => handleSave(localBp)}
          disabled={saving || isPending}
          className="h-7 text-xs shrink-0"
          style={{
            backgroundColor: 'var(--color-primary-600)',
            color: 'white',
            transition: 'background-color 150ms ease',
          }}
        >
          {saving || isPending ? '...' : 'Guardar'}
        </Button>
      )}
      {!isDone && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleMarkDone}
          disabled={saving || isPending}
          title="Marcar como completada"
          aria-label="Marcar como completada"
          className="h-7 w-7 p-0 shrink-0"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </Button>
      )}
      {error && (
        <span
          className="text-xs truncate max-w-xs"
          title={error}
          style={{ color: 'var(--color-danger)' }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
