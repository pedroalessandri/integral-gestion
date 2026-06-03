'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { OwnerSelect } from './owner-select';
import { createTaskAction, updateTaskAction } from './actions';

interface TaskInitialValues {
  id: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp: number;
  startsAt?: string;
  endsAt?: string;
}

/** Create mode — shows trigger button by default. If `open`/`onOpenChange`
 * are provided, the dialog runs controlled and the trigger is hidden (caller
 * opens it from elsewhere, e.g. a dropdown menu item). */
interface CreateProps {
  orgId: string;
  keyResultId: string;
  /** ISO-8601. Minimum date for task start (from parent Period). */
  periodStartsAt?: string;
  /** ISO-8601. Maximum date for task end (from parent Period). */
  periodEndsAt?: string;
  mode?: 'create';
  initialValues?: never;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Edit mode — controlled: caller manages open state */
interface EditProps {
  orgId: string;
  keyResultId: string;
  /** ISO-8601. Minimum date for task start (from parent Period). */
  periodStartsAt?: string;
  /** ISO-8601. Maximum date for task end (from parent Period). */
  periodEndsAt?: string;
  mode: 'edit';
  initialValues: TaskInitialValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Props = CreateProps | EditProps;

/** Convert an ISO-8601 datetime string to a date input value (YYYY-MM-DD). */
function toDateInputValue(iso?: string): string {
  if (!iso) return '';
  // Take the date portion
  return iso.slice(0, 10);
}

/** Convert a date input value (YYYY-MM-DD) to an ISO-8601 string (midnight UTC). */
function fromDateInputValue(val: string): string {
  return `${val}T00:00:00.000Z`;
}

export function CreateTaskButton(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? (props.open as boolean) : internalOpen;
  const setOpen = isControlled
    ? (props.onOpenChange as (next: boolean) => void)
    : setInternalOpen;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(props.initialValues?.title ?? '');
  const [description, setDescription] = useState(props.initialValues?.description ?? '');
  const [ownerUserId, setOwnerUserId] = useState<string | null>(
    props.initialValues?.ownerUserId ?? null,
  );
  const [weightPct, setWeightPct] = useState(
    props.initialValues ? String(props.initialValues.weightBp / 100) : '25',
  );
  const [startsAt, setStartsAt] = useState(
    toDateInputValue(props.initialValues?.startsAt ?? props.periodStartsAt),
  );
  const [endsAt, setEndsAt] = useState(
    toDateInputValue(props.initialValues?.endsAt ?? props.periodEndsAt),
  );

  const minDate = toDateInputValue(props.periodStartsAt);
  const maxDate = toDateInputValue(props.periodEndsAt);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && isEdit && props.initialValues) {
      setTitle(props.initialValues.title);
      setDescription(props.initialValues.description ?? '');
      setOwnerUserId(props.initialValues.ownerUserId ?? null);
      setWeightPct(String(props.initialValues.weightBp / 100));
      setStartsAt(toDateInputValue(props.initialValues.startsAt ?? props.periodStartsAt));
      setEndsAt(toDateInputValue(props.initialValues.endsAt ?? props.periodEndsAt));
    }
    if (!next) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const weightBp = Math.round(parseFloat(weightPct) * 100);
    if (isNaN(weightBp) || weightBp < 1 || weightBp > 10000) {
      setError('El peso debe estar entre 0.01% y 100%.');
      setLoading(false);
      return;
    }

    if (!startsAt) {
      setError('La fecha de inicio es requerida.');
      setLoading(false);
      return;
    }

    if (!endsAt) {
      setError('La fecha de fin es requerida.');
      setLoading(false);
      return;
    }

    if (startsAt > endsAt) {
      setError('La fecha de inicio no puede ser posterior a la fecha de fin.');
      setLoading(false);
      return;
    }

    let result: { error?: string };

    if (isEdit && props.initialValues) {
      result = await updateTaskAction({
        orgId: props.orgId,
        taskId: props.initialValues.id,
        title,
        description: description || null,
        ownerUserId: ownerUserId || null,
        weightBp,
        startsAt: fromDateInputValue(startsAt),
        endsAt: fromDateInputValue(endsAt),
      });
    } else {
      result = await createTaskAction({
        orgId: props.orgId,
        keyResultId: props.keyResultId,
        title,
        ownerUserId: ownerUserId || null,
        weightBp,
        startsAt: fromDateInputValue(startsAt),
        endsAt: fromDateInputValue(endsAt),
      });
    }

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    if (!isEdit) {
      setTitle('');
      setDescription('');
      setOwnerUserId(null);
      setWeightPct('25');
      setStartsAt(toDateInputValue(props.periodStartsAt));
      setEndsAt(toDateInputValue(props.periodEndsAt));
    }
    router.refresh();
  }

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar tarea' : 'Crear tarea'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Modificá los datos de la tarea.'
            : 'El peso indica cuánto aporta esta tarea al Resultado Clave (0-100%).'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="task-title">Título</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-description">Descripción (opcional)</Label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto adicional de la tarea..."
            rows={3}
            maxLength={2000}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="task-starts-at">Fecha de inicio</Label>
            <Input
              id="task-starts-at"
              type="date"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                // Suppress browser-native English validation tooltips
                e.target.setCustomValidity('');
              }}
              min={minDate || undefined}
              max={maxDate || undefined}
              // No 'required' — validation handled in JS with Spanish messages
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-ends-at">Fecha de fin</Label>
            <Input
              id="task-ends-at"
              type="date"
              value={endsAt}
              onChange={(e) => {
                setEndsAt(e.target.value);
                // Suppress browser-native English validation tooltips
                e.target.setCustomValidity('');
              }}
              min={startsAt || minDate || undefined}
              max={maxDate || undefined}
              // No 'required' — validation handled in JS with Spanish messages
            />
          </div>
        </div>
        {(minDate || maxDate) && (
          <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
            Las fechas deben estar dentro del período:{' '}
            {minDate && <strong>{minDate.split('-').reverse().join('/')}</strong>}
            {minDate && maxDate && ' — '}
            {maxDate && <strong>{maxDate.split('-').reverse().join('/')}</strong>}.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="task-weight">Peso (%)</Label>
          <Input
            id="task-weight"
            type="number"
            value={weightPct}
            onChange={(e) => setWeightPct(e.target.value)}
            step="0.01"
            min="0.01"
            max="100"
            required
          />
          <p className="text-xs text-gray-500">
            La suma de pesos de todas las tareas de este Resultado Clave debería ser 100%.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Responsable (opcional)</Label>
          <OwnerSelect orgId={props.orgId} value={ownerUserId} onChange={setOwnerUserId} />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading
              ? isEdit
                ? 'Guardando...'
                : 'Creando...'
              : isEdit
              ? 'Guardar cambios'
              : 'Crear tarea'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  // Edit mode or externally-controlled create mode: no trigger.
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
        <Button size="sm">+ Nueva tarea</Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
