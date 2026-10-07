'use client';

import type { SetSiblingWeightsDto } from '@gestion-publica/shared-types/okr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LABELS } from '@/lib/labels';
import { useWeightDraft, type WeightItem } from '../useWeightDraft';
import { TOTAL_WEIGHT_BP, formatBpPercent } from '../weights';

interface Props {
  title: string;
  description: string;
  items: WeightItem[];
  /** true al activar "Ponderar": propone el reparto equitativo (RN-P7). */
  startEqual: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (input: SetSiblingWeightsDto) => Promise<boolean>;
  onClose: () => void;
}

export function WeightsDialog({ title, description, items, startEqual, pending, error, onSubmit, onClose }: Props) {
  const draft = useWeightDraft(items, startEqual);
  const diff = draft.totalBp === null ? null : TOTAL_WEIGHT_BP - draft.totalBp;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = draft.toPayload();
    if (payload && (await onSubmit(payload))) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ul className="space-y-2">
            {items.map((item) => {
              const invalid = draft.invalidIds.has(item.id);
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <label htmlFor={`weight-${item.id}`} className="min-w-0 flex-1 truncate text-sm text-neutral-800" title={item.label}>
                    {item.label}
                  </label>
                  <div className="flex items-center gap-1">
                    <Input
                      id={`weight-${item.id}`}
                      inputMode="decimal"
                      value={draft.drafts[item.id] ?? ''}
                      onChange={(e) => draft.setDraft(item.id, e.target.value)}
                      aria-invalid={invalid}
                      className={`w-24 text-right ${invalid ? 'border-red-400' : ''}`}
                    />
                    <span className="text-sm text-neutral-500" aria-hidden>
                      %
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3">
            <Button type="button" variant="outline" size="sm" onClick={draft.equalize}>
              Repartir en partes iguales
            </Button>
            <p
              role="status"
              className={`text-sm font-medium ${draft.isValid ? 'text-emerald-700' : 'text-amber-800'}`}
            >
              Suma: {draft.totalBp === null ? 'revisá los valores' : formatBpPercent(draft.totalBp, 2)}
              {diff !== null && diff !== 0 && ` (${diff > 0 ? 'faltan' : 'sobran'} ${formatBpPercent(Math.abs(diff), 2)})`}
            </p>
          </div>
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !draft.isValid}>
              {pending ? 'Guardando...' : `Guardar ${LABELS.weighting.weight.toLowerCase()}s`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
