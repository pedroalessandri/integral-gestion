'use client';

import { useState } from 'react';
import type { TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OwnerSelect } from '@/components/objectives/owner-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isoToDateInput } from '@/features/strategic-plan/plan-form';
import { LABELS } from '@/lib/labels';
import { isDateRangeValid, taskToFormValues, type TaskFormValues } from '../project-form';

interface Props {
  orgId: string;
  /** null = crear. */
  task: TaskSummaryDto | null;
  project: { startsAt: string; endsAt: string };
  /** En un grupo ponderado la tarea nueva entra con 0 % y se ajusta con "Editar pesos". */
  groupWeighted: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (values: TaskFormValues) => Promise<boolean>;
  onClose: () => void;
}

export function TaskFormDialog({ orgId, task, project, groupWeighted, pending, error, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<TaskFormValues>(() => taskToFormValues(task, project));
  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const datesOk = isDateRangeValid(values.startsAt, values.endsAt);
  const singular = LABELS.task.singular.toLowerCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (await onSubmit(values)) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? `Editar ${singular}` : `Nueva ${singular}`}</DialogTitle>
          <DialogDescription>Las fechas tienen que estar dentro de las del proyecto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              required
              maxLength={200}
            />
          </div>
          {!task && (
            <>
              <div className="space-y-2">
                <Label htmlFor="task-description">Descripción (opcional)</Label>
                <Textarea
                  id="task-description"
                  value={values.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Responsable (opcional)</Label>
                <OwnerSelect orgId={orgId} value={values.ownerUserId} onChange={(id) => set('ownerUserId', id)} />
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-starts">Inicio</Label>
              <Input
                id="task-starts"
                type="date"
                value={values.startsAt}
                min={isoToDateInput(project.startsAt)}
                max={isoToDateInput(project.endsAt)}
                onChange={(e) => set('startsAt', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-ends">Fin</Label>
              <Input
                id="task-ends"
                type="date"
                value={values.endsAt}
                min={isoToDateInput(project.startsAt)}
                max={isoToDateInput(project.endsAt)}
                onChange={(e) => set('endsAt', e.target.value)}
                required
              />
            </div>
          </div>
          {!datesOk && values.startsAt !== '' && values.endsAt !== '' && (
            <p className="text-xs text-red-600">El inicio tiene que ser anterior o igual al fin.</p>
          )}
          {!task && groupWeighted && (
            <p className="text-xs text-amber-800">
              Las tareas están ponderadas: la nueva se crea con peso 0 %. Ajustá el reparto con “
              {LABELS.weighting.editWeights}”.
            </p>
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
            <Button type="submit" disabled={pending || values.title.trim() === '' || !datesOk}>
              {pending ? 'Guardando...' : task ? 'Guardar cambios' : `Crear ${singular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
