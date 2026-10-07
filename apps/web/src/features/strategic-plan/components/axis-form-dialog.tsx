'use client';

import { useState } from 'react';
import type { AxisDto, CreateAxisDto, UpdateAxisDto } from '@gestion-publica/shared-types/planning';
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
import { axisToFormValues, toCreateAxisDto, toUpdateAxisDto, type AxisFormValues } from '../plan-form';

type Props = {
  pending: boolean;
  error: string | null;
  onClose: () => void;
} & (
  | { axis: null; onSubmit: (dto: CreateAxisDto) => Promise<boolean> }
  | { axis: AxisDto; onSubmit: (dto: UpdateAxisDto) => Promise<boolean> }
);

export function AxisFormDialog(props: Props) {
  const { pending, error, onClose } = props;
  const [values, setValues] = useState<AxisFormValues>(() => axisToFormValues(props.axis));
  const set = <K extends keyof AxisFormValues>(key: K, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (props.axis) {
      const dto = toUpdateAxisDto(props.axis, values);
      if (Object.keys(dto).length === 0 || (await props.onSubmit(dto))) onClose();
    } else if (await props.onSubmit(toCreateAxisDto(values))) {
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.axis ? `Editar ${LABELS.axis.singular.toLowerCase()}` : `Nuevo ${LABELS.axis.singular.toLowerCase()}`}</DialogTitle>
          <DialogDescription>
            Un {LABELS.axis.singular.toLowerCase()} agrupa {LABELS.objective.plural.toLowerCase()} de una o más unidades.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="axis-name">Nombre</Label>
            <Input
              id="axis-name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej: Ciudad sostenible"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="axis-description">Descripción (opcional)</Label>
            <Textarea
              id="axis-description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="axis-order">Orden (opcional)</Label>
            <Input
              id="axis-order"
              type="number"
              min={0}
              step={1}
              value={values.order}
              onChange={(e) => set('order', e.target.value)}
              className="w-28"
            />
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
            <Button type="submit" disabled={pending || values.name.trim() === ''}>
              {pending ? 'Guardando...' : props.axis ? 'Guardar cambios' : 'Crear eje'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
