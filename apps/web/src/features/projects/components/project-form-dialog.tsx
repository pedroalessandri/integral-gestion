'use client';

import { useState } from 'react';
import type { ProjectDetailDto } from '@gestion-publica/shared-types/okr';
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
import { LABELS } from '@/lib/labels';
import { isDateRangeValid, projectToFormValues, type ProjectFormValues } from '../project-form';
import { isoToDateInput } from '@/features/strategic-plan/plan-form';
import { UnitPicker } from './unit-picker';

interface Props {
  orgId: string;
  /** null = crear. */
  project: ProjectDetailDto | null;
  objective: { orgUnitId: string; periodStartsAt: string; periodEndsAt: string };
  pending: boolean;
  error: string | null;
  onSubmit: (values: ProjectFormValues) => Promise<boolean>;
  onClose: () => void;
}

export function ProjectFormDialog({ orgId, project, objective, pending, error, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<ProjectFormValues>(() => projectToFormValues(project, objective));
  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const datesOk = isDateRangeValid(values.startsAt, values.endsAt);
  const singular = LABELS.project.singular.toLowerCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (await onSubmit(values)) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? `Editar ${singular}` : `Nuevo ${singular}`}</DialogTitle>
          <DialogDescription>
            El avance del {singular} se calcula desde sus tareas. Las fechas tienen que estar dentro del período del
            objetivo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-title">Título</Label>
            <Input
              id="project-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ej: Ciclovía de la avenida central"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Descripción (opcional)</Label>
            <Textarea
              id="project-description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-starts">Inicio</Label>
              <Input
                id="project-starts"
                type="date"
                value={values.startsAt}
                min={isoToDateInput(objective.periodStartsAt)}
                max={isoToDateInput(objective.periodEndsAt)}
                onChange={(e) => set('startsAt', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-ends">Fin</Label>
              <Input
                id="project-ends"
                type="date"
                value={values.endsAt}
                min={isoToDateInput(objective.periodStartsAt)}
                max={isoToDateInput(objective.periodEndsAt)}
                onChange={(e) => set('endsAt', e.target.value)}
                required
              />
            </div>
          </div>
          {!datesOk && values.startsAt !== '' && values.endsAt !== '' && (
            <p className="text-xs text-red-600">El inicio tiene que ser anterior o igual al fin.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="project-unit">{LABELS.unit.singular}</Label>
            <UnitPicker
              id="project-unit"
              orgId={orgId}
              objectiveUnitId={objective.orgUnitId}
              value={values.orgUnitId}
              onChange={(id) => set('orgUnitId', id)}
            />
          </div>
          <div className="space-y-2">
            <Label>Responsable (opcional)</Label>
            <OwnerSelect orgId={orgId} value={values.ownerUserId} onChange={(id) => set('ownerUserId', id)} />
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
            <Button type="submit" disabled={pending || values.title.trim() === '' || !datesOk}>
              {pending ? 'Guardando...' : project ? 'Guardar cambios' : `Crear ${singular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
