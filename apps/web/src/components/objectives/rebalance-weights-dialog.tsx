'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { rebalanceKrWeightsAction } from './actions';

interface KrInput {
  id: string;
  title: string;
  weightBp: number;
}

export function RebalanceWeightsDialog({
  orgId,
  objectiveId,
  keyResults,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  orgId: string;
  objectiveId: string;
  keyResults: KrInput[];
  /** Optional controlled state — when present the trigger button is hidden
   *  and the caller (e.g. a dropdown menu item) opens the dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? (controlledOpen as boolean) : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange as (next: boolean) => void)
    : setInternalOpen;
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(keyResults.map((kr) => [kr.id, (kr.weightBp / 100).toString()])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sumPct = Object.values(weights).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
  const balanced = Math.round(sumPct * 100) === 10000;

  function distribute() {
    const n = keyResults.length;
    if (n === 0) return;
    const base = Math.floor(10000 / n);
    const remainder = 10000 - base * n;
    const newWeights: Record<string, string> = {};
    keyResults.forEach((kr, i) => {
      const bp = base + (i === 0 ? remainder : 0);
      newWeights[kr.id] = (bp / 100).toFixed(2);
    });
    setWeights(newWeights);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = keyResults.map((kr) => ({
      krId: kr.id,
      weightBp: Math.round(parseFloat(weights[kr.id] ?? '0') * 100),
    }));

    const totalBp = payload.reduce((acc, w) => acc + w.weightBp, 0);
    if (totalBp !== 10000) {
      setError(`La suma debe ser exactamente 100%. Actualmente: ${(totalBp / 100).toFixed(2)}%`);
      setLoading(false);
      return;
    }

    const result = await rebalanceKrWeightsAction({ orgId, objectiveId, weights: payload });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">Rebalancear pesos</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rebalancear pesos de los Resultados Clave</DialogTitle>
          <DialogDescription>
            Ajustá los pesos de cada Resultado Clave. La suma debe ser exactamente 100%.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {keyResults.map((kr) => (
              <div key={kr.id} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                <Label htmlFor={`kr-${kr.id}`} className="truncate">{kr.title}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id={`kr-${kr.id}`}
                    type="number"
                    value={weights[kr.id] ?? ''}
                    onChange={(e) => setWeights({ ...weights, [kr.id]: e.target.value })}
                    step="0.01"
                    min="0"
                    max="100"
                    className="w-24"
                    required
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`rounded-md p-3 text-sm flex items-center justify-between ${balanced ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
            <span><strong>Suma:</strong> {sumPct.toFixed(2)}% {balanced ? '✓' : ''}</span>
            <Button type="button" size="sm" variant="ghost" onClick={distribute}>
              Distribuir parejo
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !balanced}>
              {loading ? 'Guardando...' : 'Aplicar pesos'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
