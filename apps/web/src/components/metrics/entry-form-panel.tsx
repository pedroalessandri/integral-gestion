'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatBucketLabel } from './format';
import { createEntryAction } from './actions';

interface Props {
  orgId: string;
  metricId: string;
  /** Valid bucket start dates (ISO), ascending. Includes past buckets for retroactive loads. */
  buckets: string[];
  readOnly: boolean;
}

const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

/** Default bucket: the latest boundary on or before `nowMs`, else the first. */
function defaultBucket(buckets: string[], nowMs: number): string {
  const past = buckets.filter((b) => new Date(b).getTime() <= nowMs);
  return past[past.length - 1] ?? buckets[0] ?? '';
}

export function EntryFormPanel({ orgId, metricId, buckets, readOnly }: Props) {
  const router = useRouter();
  // Capture "now" once on mount — avoids calling Date.now() during render.
  const [nowMs] = useState(() => Date.now());
  const [bucketDate, setBucketDate] = useState(() => defaultBucket(buckets, nowMs));
  const [incrementValue, setIncrementValue] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (readOnly) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'var(--color-neutral-50)', borderColor: 'var(--color-neutral-200)' }}
      >
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-neutral-600)' }}>
          <Lock className="h-4 w-4" aria-hidden="true" />
          Período cerrado
        </div>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--color-neutral-500)' }}>
          Este indicador pertenece a un período cerrado. La carga de avances está deshabilitada.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bucketDate) {
      setError('Elegí un bucket.');
      return;
    }
    if (!DECIMAL_RE.test(incrementValue)) {
      setError('El incremento debe ser numérico (hasta 4 decimales).');
      return;
    }
    setSaving(true);
    const result = await createEntryAction({
      orgId,
      metricId,
      bucketDate,
      incrementValue,
      comment: comment.trim() || undefined,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIncrementValue('');
    setComment('');
    router.refresh();
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'white', borderColor: 'var(--color-neutral-200)', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
    >
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-neutral-900)' }}>
        Cargar avance
      </h3>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-neutral-500)' }}>
        Registrá el <strong>incremento</strong> del bucket (no el acumulado). Podés cargar buckets anteriores.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="entry-bucket">Bucket</Label>
          <select
            id="entry-bucket"
            value={bucketDate}
            onChange={(e) => setBucketDate(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {buckets.map((b) => (
              <option key={b} value={b}>
                {formatBucketLabel(b)}
                {new Date(b).getTime() > nowMs ? ' (futuro)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="entry-increment">Incremento</Label>
          <Input
            id="entry-increment"
            value={incrementValue}
            onChange={(e) => setIncrementValue(e.target.value)}
            inputMode="decimal"
            required
            placeholder="Ej: 25"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="entry-comment">Comentario (opcional)</Label>
          <Textarea
            id="entry-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Contexto de esta carga..."
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-2.5">
            <p className="text-red-700 text-xs">{error}</p>
          </div>
        )}

        <Button type="submit" size="sm" disabled={saving} className="w-full">
          {saving ? 'Guardando...' : '+ Cargar avance'}
        </Button>
      </form>
    </div>
  );
}
