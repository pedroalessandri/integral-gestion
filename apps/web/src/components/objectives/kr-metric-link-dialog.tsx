'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  KrMetricLinkFields,
  validateMetricLinkFields,
  type MetricLinkFieldsValue,
} from './kr-metric-link-fields';
import { upsertKrMetricLinkAction, updateKrMetricLinkAction } from './actions';
import type { MetricKrLinkDto } from '@gestion-publica/shared-types/metrics';

interface Props {
  orgId: string;
  krId: string;
  periodId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'link' = create/replace (PUT); 'edit' = edit snapshot (PATCH). */
  mode: 'link' | 'edit';
  /** Existing link for edit prefill. */
  initialLink?: MetricKrLinkDto | null;
}

const EMPTY: MetricLinkFieldsValue = {
  metricId: '',
  baselineValue: '',
  targetValue: '',
  direction: 'increasing',
};

export function KrMetricLinkDialog({
  orgId,
  krId,
  periodId,
  open,
  onOpenChange,
  mode,
  initialLink,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<MetricLinkFieldsValue>(
    initialLink
      ? {
          metricId: initialLink.metricId,
          baselineValue: initialLink.baselineValue,
          targetValue: initialLink.targetValue,
          direction: initialLink.direction,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setError(null);
      setValue(
        initialLink
          ? {
              metricId: initialLink.metricId,
              baselineValue: initialLink.baselineValue,
              targetValue: initialLink.targetValue,
              direction: initialLink.direction,
            }
          : EMPTY,
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateMetricLinkFields(value, { requireMetric: mode === 'link' });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);

    const result =
      mode === 'link'
        ? await upsertKrMetricLinkAction({
            orgId,
            krId,
            metricId: value.metricId,
            baselineValue: value.baselineValue,
            targetValue: value.targetValue,
            direction: value.direction,
          })
        : await updateKrMetricLinkAction({
            orgId,
            krId,
            baselineValue: value.baselineValue,
            targetValue: value.targetValue,
            direction: value.direction,
          });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'link' ? 'Vincular indicador' : 'Editar vínculo'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'link'
              ? 'El Resultado Clave pasará a modo automático: su avance se calcula desde el indicador.'
              : 'Modificá el baseline, la meta o la dirección. El avance se recalcula de inmediato.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <KrMetricLinkFields
            orgId={orgId}
            periodId={periodId}
            value={value}
            onChange={setValue}
            mode={mode}
            disabled={saving}
          />
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : mode === 'link' ? 'Vincular' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
