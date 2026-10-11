'use client';

import { useState } from 'react';
import type { StrategicPlanDto, UpsertStrategicPlanDto } from '@gestion-publica/shared-types/planning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLabels } from '@/lib/labels/labels-provider';
import { isMandateRangeValid, planToFormValues, toUpsertPlanDto, type PlanFormValues } from '../plan-form';

interface Props {
  plan: StrategicPlanDto | null;
  pending: boolean;
  error: string | null;
  onSubmit: (dto: UpsertStrategicPlanDto) => Promise<boolean>;
  onClose: () => void;
}

export function PlanFormDialog({ plan, pending, error, onSubmit, onClose }: Props) {
  const labels = useLabels();
  const [values, setValues] = useState<PlanFormValues>(() => planToFormValues(plan));
  const set = <K extends keyof PlanFormValues>(key: K, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const rangeInvalid =
    values.mandateStartsAt !== '' && values.mandateEndsAt !== '' && !isMandateRangeValid(values);
  const canSubmit =
    !pending &&
    values.title.trim() !== '' &&
    values.vision.trim() !== '' &&
    isMandateRangeValid(values);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (await onSubmit(toUpsertPlanDto(values))) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Editar ${labels.plan.singular}` : `Crear ${labels.plan.singular}`}</DialogTitle>
          <DialogDescription>
            {labels.plan.formDescription}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-title">Título</Label>
            <Input
              id="plan-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={labels.plan.titlePlaceholder}
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-vision">{labels.plan.vision}</Label>
            <Textarea
              id="plan-vision"
              value={values.vision}
              onChange={(e) => set('vision', e.target.value)}
              placeholder={labels.plan.visionPlaceholder}
              rows={5}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-start">{labels.plan.termStart}</Label>
              <Input
                id="plan-start"
                type="date"
                value={values.mandateStartsAt}
                onChange={(e) => set('mandateStartsAt', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-end">{labels.plan.termEnd}</Label>
              <Input
                id="plan-end"
                type="date"
                value={values.mandateEndsAt}
                onChange={(e) => set('mandateEndsAt', e.target.value)}
                required
              />
            </div>
          </div>
          {rangeInvalid && (
            <p className="text-sm text-red-600">{labels.plan.rangeInvalid}</p>
          )}
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? 'Guardando...' : plan ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
