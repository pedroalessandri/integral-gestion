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
import { createObjectiveAction, updateObjectiveAction } from './actions';
import { AiSuggestPanel } from '@/components/ai/ai-suggest-panel';
import { SmartFeedbackPanel } from '@/components/ai/smart-feedback-panel';
import { OwnerSelect } from './owner-select';
import { UnitSelect } from '@/features/org-structure';
import { AxisSelect } from '@/features/strategic-plan';
import { assignmentForCreate, assignmentForUpdate, hasUnit } from '@/features/planning/objective-assignment';
import { LABELS } from '@/lib/labels';

interface ObjectiveInitialValues {
  id: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  orgUnitId?: string | null;
  axisId?: string | null;
}

/** Create mode — shows a trigger button */
interface CreateProps {
  orgId: string;
  mode?: 'create';
  initialValues?: never;
  open?: never;
  onOpenChange?: never;
  disabled?: boolean;
  disabledTooltip?: string;
  aiEnabled?: boolean;
  /** Default owner for new objectives — server component passes current user's id. */
  defaultOwnerUserId?: string | null;
}

/** Edit mode — controlled: caller manages open state */
interface EditProps {
  orgId: string;
  mode: 'edit';
  initialValues: ObjectiveInitialValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiEnabled?: boolean;
  defaultOwnerUserId?: never;
}

type Props = CreateProps | EditProps;

export function CreateObjectiveButton(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';
  const aiEnabled = props.aiEnabled ?? true;

  // Uncontrolled open state (create mode)
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isEdit ? props.open : internalOpen;
  const setOpen = isEdit ? props.onOpenChange : setInternalOpen;

  const defaultOwnerId = !isEdit ? ((props as CreateProps).defaultOwnerUserId ?? null) : null;

  const [orgUnitId, setOrgUnitId] = useState<string | null>(props.initialValues?.orgUnitId ?? null);
  const [axisId, setAxisId] = useState<string | null>(props.initialValues?.axisId ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(props.initialValues?.title ?? '');
  const [description, setDescription] = useState(props.initialValues?.description ?? '');
  const [ownerUserId, setOwnerUserId] = useState<string | null>(
    isEdit ? (props.initialValues?.ownerUserId ?? null) : defaultOwnerId,
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && isEdit && props.initialValues) {
      setTitle(props.initialValues.title);
      setDescription(props.initialValues.description ?? '');
      setOwnerUserId(props.initialValues.ownerUserId ?? null);
      setOrgUnitId(props.initialValues.orgUnitId ?? null);
      setAxisId(props.initialValues.axisId ?? null);
    }
    if (!next) {
      setError(null);
      if (!isEdit) {
        // Reset to default on close in create mode
        setOwnerUserId(defaultOwnerId);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const assignment = { orgUnitId, axisId };
    setLoading(true);

    let result: { error?: string };

    if (isEdit && props.initialValues) {
      result = await updateObjectiveAction({
        orgId: props.orgId,
        objectiveId: props.initialValues.id,
        title,
        // El listado no trae la descripción: solo se envía si el usuario la cambió (si no, se borraría).
        ...(description !== (props.initialValues.description ?? '') && { description: description || null }),
        ownerUserId,
        ...assignmentForUpdate(
          {
            orgUnitId: props.initialValues.orgUnitId ?? null,
            axisId: props.initialValues.axisId ?? null,
          },
          { orgUnitId, axisId },
        ),
      });
    } else if (hasUnit(assignment)) {
      result = await createObjectiveAction({
        orgId: props.orgId,
        title,
        description: description || undefined,
        ownerUserId,
        ...assignmentForCreate(assignment),
      });
    } else {
      result = { error: LABELS.unit.required };
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
      setOwnerUserId(defaultOwnerId);
      setOrgUnitId(null);
      setAxisId(null);
    }
    router.refresh();
  }

  const dialogContent = (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar objetivo' : 'Crear objetivo'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Modificá los datos del objetivo.'
            : 'Se creará en el período abierto de la organización activa.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="obj-title">Título</Label>
          <Input
            id="obj-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Mejorar atención ciudadana"
            required
            maxLength={200}
          />
        </div>
        <AiSuggestPanel
          orgId={props.orgId}
          onAccept={(suggestion) => setTitle(suggestion)}
          aiEnabled={aiEnabled}
        />
        <div className="space-y-2">
          <Label htmlFor="obj-description">Descripción (opcional)</Label>
          <Textarea
            id="obj-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto adicional del objetivo..."
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="obj-owner">Responsable</Label>
          <OwnerSelect orgId={props.orgId} value={ownerUserId} onChange={setOwnerUserId} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="obj-unit">{LABELS.unit.singular}</Label>
            <UnitSelect
              id="obj-unit"
              orgId={props.orgId}
              value={orgUnitId}
              onChange={setOrgUnitId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obj-axis">{LABELS.axis.singular}</Label>
            <AxisSelect id="obj-axis" orgId={props.orgId} value={axisId} onChange={setAxisId} />
          </div>
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
              : 'Crear objetivo'}
          </Button>
        </DialogFooter>
      </form>
      {title.trim() && (
        <div className="mt-4">
          <SmartFeedbackPanel orgId={props.orgId} text={title} aiEnabled={aiEnabled} />
        </div>
      )}
    </DialogContent>
  );

  if (isEdit) {
    // Controlled mode — no trigger button, caller opens the dialog
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {dialogContent}
      </Dialog>
    );
  }

  const isDisabled = !isEdit && (props as CreateProps).disabled;
  const disabledTooltip = !isEdit ? (props as CreateProps).disabledTooltip : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          disabled={isDisabled}
          title={isDisabled && disabledTooltip ? disabledTooltip : undefined}
          aria-label={isDisabled && disabledTooltip ? disabledTooltip : undefined}
        >
          + Nuevo objetivo
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
