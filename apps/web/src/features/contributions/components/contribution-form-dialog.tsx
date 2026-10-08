'use client';

import { useState } from 'react';
import type { ObjectiveIndicatorDto, ProjectContributionDto } from '@gestion-publica/shared-types/metrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMetricValue } from '@/components/metrics/format';
import { CONTRIBUTION_LABELS as L } from '@/lib/labels';
import { validateContributionValue } from '../contributions';

interface Props {
  /** `null` = agregar. */
  contribution: ProjectContributionDto | null;
  /** Indicadores elegibles para agregar; al editar solo se muestra el del aporte. */
  available: ObjectiveIndicatorDto[];
  editingIndicator: ObjectiveIndicatorDto | null;
  pending: boolean;
  error: string | null;
  onCreate: (indicatorId: string, value: string) => Promise<boolean>;
  onUpdate: (contribution: ProjectContributionDto, value: string) => Promise<boolean>;
  onClose: () => void;
}

export function ContributionFormDialog({
  contribution,
  available,
  editingIndicator,
  pending,
  error,
  onCreate,
  onUpdate,
  onClose,
}: Props) {
  const [indicatorId, setIndicatorId] = useState(available.length === 1 ? (available[0]?.id ?? '') : '');
  const [value, setValue] = useState(contribution?.contributionValue ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const picked = contribution ? editingIndicator : (available.find((i) => i.id === indicatorId) ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contribution && indicatorId === '') {
      setLocalError('Elegí el indicador al que aporta el proyecto.');
      return;
    }
    const problem = validateContributionValue(value);
    setLocalError(problem);
    if (problem) return;
    const ok = contribution ? await onUpdate(contribution, value) : await onCreate(indicatorId, value);
    if (ok) onClose();
  }

  const shownError = localError ?? error;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contribution ? L.editTitle : L.addTitle}</DialogTitle>
          <DialogDescription>{L.sectionHint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contribution-indicator">{L.indicator}</Label>
            {contribution ? (
              <p id="contribution-indicator" className="text-sm text-neutral-800">
                {editingIndicator?.metricName ?? '—'}
              </p>
            ) : (
              <select
                id="contribution-indicator"
                value={indicatorId}
                onChange={(e) => setIndicatorId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Elegí un indicador…</option>
                {available.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.metricName}
                  </option>
                ))}
              </select>
            )}
            {picked && (
              <p className="text-xs text-neutral-500">
                Base {formatMetricValue(picked.baselineValue, picked.unit)} → Meta{' '}
                {formatMetricValue(picked.targetValue, picked.unit)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contribution-value">{L.value}</Label>
            <Input
              id="contribution-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej: 4"
              aria-describedby="contribution-value-help"
            />
            <p id="contribution-value-help" className="text-xs text-neutral-500">
              {L.valueHelp}
            </p>
          </div>
          {shownError && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{shownError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando...' : contribution ? 'Guardar cambios' : L.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
