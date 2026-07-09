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
import type { MetricUnit, MetricDirection, MetricFrequency } from '@gestion-publica/shared-types/metrics';
import { UNIT_LABELS, FREQUENCY_LABELS } from './format';
import { createMetricAction, updateMetricAction } from './actions';

interface MetricInitialValues {
  id: string;
  name: string;
  unit: MetricUnit;
  direction: MetricDirection;
  frequency: MetricFrequency;
  baselineValue: string;
  targetValue: string;
}

interface CreateProps {
  orgId: string;
  mode?: 'create';
  initialValues?: never;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface EditProps {
  orgId: string;
  mode: 'edit';
  initialValues: MetricInitialValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Props = CreateProps | EditProps;

const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

export function MetricFormDialog(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isEdit || isControlled ? (props.open as boolean) : internalOpen;
  const setOpen =
    isEdit || isControlled ? (props.onOpenChange as (next: boolean) => void) : setInternalOpen;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(props.initialValues?.name ?? '');
  const [unit, setUnit] = useState<MetricUnit>(props.initialValues?.unit ?? 'number');
  const [direction, setDirection] = useState<MetricDirection>(
    props.initialValues?.direction ?? 'increasing',
  );
  const [frequency, setFrequency] = useState<MetricFrequency>(
    props.initialValues?.frequency ?? 'monthly',
  );
  const [baselineValue, setBaselineValue] = useState(props.initialValues?.baselineValue ?? '0');
  const [targetValue, setTargetValue] = useState(props.initialValues?.targetValue ?? '');

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && isEdit && props.initialValues) {
      setName(props.initialValues.name);
      setUnit(props.initialValues.unit);
      setDirection(props.initialValues.direction);
      setFrequency(props.initialValues.frequency);
      setBaselineValue(props.initialValues.baselineValue);
      setTargetValue(props.initialValues.targetValue);
    }
    if (!next) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!DECIMAL_RE.test(baselineValue)) {
      setError('El valor base debe ser numérico (hasta 4 decimales).');
      return;
    }
    if (!DECIMAL_RE.test(targetValue)) {
      setError('La meta debe ser numérica (hasta 4 decimales).');
      return;
    }

    setLoading(true);
    let result: { error?: string };
    if (isEdit && props.initialValues) {
      result = await updateMetricAction({
        orgId: props.orgId,
        metricId: props.initialValues.id,
        name,
        baselineValue,
        targetValue,
      });
    } else {
      result = await createMetricAction({
        orgId: props.orgId,
        name,
        unit,
        direction,
        frequency,
        baselineValue,
        targetValue,
      });
    }
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    if (!isEdit) {
      setName('');
      setUnit('number');
      setDirection('increasing');
      setFrequency('monthly');
      setBaselineValue('0');
      setTargetValue('');
    }
    router.refresh();
  }

  const dialogContent = (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar indicador' : 'Nuevo indicador'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'La unidad, la dirección y la frecuencia no se pueden cambiar una vez creado el indicador.'
            : 'Definí unidad, dirección y frecuencia. No se podrán cambiar después.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="metric-name">Nombre</Label>
          <Input
            id="metric-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="Ej: Trámites digitalizados"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="metric-unit">Unidad</Label>
            <select
              id="metric-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as MetricUnit)}
              disabled={isEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60 disabled:bg-neutral-50"
            >
              {(Object.keys(UNIT_LABELS) as MetricUnit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-frequency">Frecuencia</Label>
            <select
              id="metric-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as MetricFrequency)}
              disabled={isEdit}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60 disabled:bg-neutral-50"
            >
              {(Object.keys(FREQUENCY_LABELS) as MetricFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="metric-direction">Dirección</Label>
          <select
            id="metric-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as MetricDirection)}
            disabled={isEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60 disabled:bg-neutral-50"
          >
            <option value="increasing">Creciente — llegar a la meta subiendo</option>
            <option value="decreasing">Decreciente — bajar hasta la meta</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="metric-baseline">Valor base</Label>
            <Input
              id="metric-baseline"
              value={baselineValue}
              onChange={(e) => setBaselineValue(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
            <p className="text-xs text-neutral-500">Punto de partida de la curva esperada.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-target">Meta del período</Label>
            <Input
              id="metric-target"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              inputMode="decimal"
              required
              placeholder="Ej: 500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear indicador'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  if (isEdit || isControlled) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">+ Nuevo indicador</Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
