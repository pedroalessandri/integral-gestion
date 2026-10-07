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
import { LABELS } from '@/lib/labels';
import { isMandateRangeValid, planToFormValues, toUpsertPlanDto, type PlanFormValues } from '../plan-form';

interface Props {
  plan: StrategicPlanDto | null;
  pending: boolean;
  error: string | null;
  onSubmit: (dto: UpsertStrategicPlanDto) => Promise<boolean>;
  onClose: () => void;
}

export function PlanFormDialog({ plan, pending, error, onSubmit, onClose }: Props) {
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
          <DialogTitle>{plan ? `Editar ${LABELS.plan.singular}` : `Crear ${LABELS.plan.singular}`}</DialogTitle>
          <DialogDescription>
            Es la {LABELS.plan.vision.toLowerCase()} del mandato. Solo hay un plan vigente por organización.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-title">Título</Label>
            <Input
              id="plan-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ej: Plan de gobierno 2026-2029"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-vision">{LABELS.plan.vision}</Label>
            <Textarea
              id="plan-vision"
              value={values.vision}
              onChange={(e) => set('vision', e.target.value)}
              placeholder="Hacia dónde va el gobierno durante este mandato..."
              rows={5}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-start">Inicio del mandato</Label>
              <Input
                id="plan-start"
                type="date"
                value={values.mandateStartsAt}
                onChange={(e) => set('mandateStartsAt', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-end">Fin del mandato</Label>
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
            <p className="text-sm text-red-600">El fin del mandato tiene que ser posterior al inicio.</p>
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
