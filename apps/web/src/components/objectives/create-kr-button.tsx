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
import { createKrAction, updateKrAction, upsertKrMetricLinkAction } from './actions';
import { AiSuggestPanel } from '@/components/ai/ai-suggest-panel';
import { SmartFeedbackPanel } from '@/components/ai/smart-feedback-panel';
import {
  KrMetricLinkFields,
  validateMetricLinkFields,
  type MetricLinkFieldsValue,
} from './kr-metric-link-fields';

interface KrInitialValues {
  id: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp: number;
}

/** Create mode — shows trigger button by default. If `open`/`onOpenChange`
 * are provided, the dialog runs controlled and the trigger is hidden. */
interface CreateProps {
  orgId: string;
  objectiveId: string;
  objectiveContext?: string;
  mode?: 'create';
  initialValues?: never;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  aiEnabled?: boolean;
  /** M2: when enabled (and periodId present), the "Modo de progreso" selector appears. */
  indicadoresOkrEnabled?: boolean;
  /** Period of the objective — needed to scope the linkable indicators (RN-O3). */
  periodId?: string;
}

/** Edit mode — controlled: caller manages open state */
interface EditProps {
  orgId: string;
  objectiveId: string;
  objectiveContext?: string;
  mode: 'edit';
  initialValues: KrInitialValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiEnabled?: boolean;
  indicadoresOkrEnabled?: boolean;
  periodId?: string;
}

type Props = CreateProps | EditProps;

export function CreateKrButton(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const aiEnabled = props.aiEnabled ?? true;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isEdit || isControlled ? (props.open as boolean) : internalOpen;
  const setOpen =
    isEdit || isControlled
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
    props.initialValues ? String(props.initialValues.weightBp / 100) : '50',
  );

  // M2: progress mode is only selectable on CREATE, when the module is enabled
  // and the objective's period is known. Editing an existing link is done from
  // the KR kebab (Editar vínculo / Desvincular), so it stays out of the edit form.
  const canPickMode = !isEdit && !!props.indicadoresOkrEnabled && !!props.periodId;
  const [progressMode, setProgressMode] = useState<'manual' | 'automatic'>('manual');
  const [linkValue, setLinkValue] = useState<MetricLinkFieldsValue>({
    metricId: '',
    baselineValue: '',
    targetValue: '',
    direction: 'increasing',
  });

  function resetLinkState() {
    setProgressMode('manual');
    setLinkValue({ metricId: '', baselineValue: '', targetValue: '', direction: 'increasing' });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && isEdit && props.initialValues) {
      setTitle(props.initialValues.title);
      setDescription(props.initialValues.description ?? '');
      setOwnerUserId(props.initialValues.ownerUserId ?? null);
      setWeightPct(String(props.initialValues.weightBp / 100));
    }
    if (next && !isEdit) resetLinkState();
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

    const wantsAutomatic = canPickMode && progressMode === 'automatic';
    if (wantsAutomatic) {
      const linkError = validateMetricLinkFields(linkValue, { requireMetric: true });
      if (linkError) {
        setError(linkError);
        setLoading(false);
        return;
      }
    }

    if (isEdit && props.initialValues) {
      const result = await updateKrAction({
        orgId: props.orgId,
        krId: props.initialValues.id,
        title,
        description: description || null,
        ownerUserId: ownerUserId || null,
        weightBp,
      });
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      return;
    }

    // Create flow — create the KR first, then (if automatic) link the indicator.
    const created = await createKrAction({
      orgId: props.orgId,
      objectiveId: props.objectiveId,
      title,
      ownerUserId: ownerUserId || null,
      weightBp,
    });
    if (created.error) {
      setLoading(false);
      setError(created.error);
      return;
    }

    if (wantsAutomatic) {
      const krId = (created.kr as { id?: string } | undefined)?.id;
      if (!krId) {
        setLoading(false);
        setError('El Resultado Clave se creó pero no se pudo vincular el indicador (falta id).');
        router.refresh();
        return;
      }
      const linkResult = await upsertKrMetricLinkAction({
        orgId: props.orgId,
        krId,
        metricId: linkValue.metricId,
        baselineValue: linkValue.baselineValue,
        targetValue: linkValue.targetValue,
        direction: linkValue.direction,
      });
      if (linkResult.error) {
        setLoading(false);
        setError(`El Resultado Clave se creó pero no se pudo vincular el indicador: ${linkResult.error}`);
        router.refresh();
        return;
      }
    }

    setLoading(false);
    setOpen(false);
    setTitle('');
    setDescription('');
    setOwnerUserId(null);
    setWeightPct('50');
    resetLinkState();
    router.refresh();
  }

  const dialogContent = (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar Resultado Clave' : 'Crear Resultado Clave'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Modificá los datos del Resultado Clave.'
            : 'El peso indica cuánto aporta este Resultado Clave al objetivo (0-100%).'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="kr-title">Título</Label>
          <Input
            id="kr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <AiSuggestPanel
          orgId={props.orgId}
          entityType="key_result"
          objectiveContext={props.objectiveContext}
          onAccept={(suggestion) => setTitle(suggestion)}
          aiEnabled={aiEnabled}
        />
        <div className="space-y-2">
          <Label htmlFor="kr-description">Descripción (opcional)</Label>
          <Textarea
            id="kr-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto adicional del Resultado Clave..."
            rows={3}
            maxLength={2000}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kr-weight">Peso (%)</Label>
          <Input
            id="kr-weight"
            type="number"
            value={weightPct}
            onChange={(e) => setWeightPct(e.target.value)}
            step="0.01"
            min="0.01"
            max="100"
            required
          />
          <p className="text-xs text-gray-500">La suma de pesos de todos los Resultados Clave debería ser 100%.</p>
        </div>
        <div className="space-y-2">
          <Label>Responsable (opcional)</Label>
          <OwnerSelect orgId={props.orgId} value={ownerUserId} onChange={setOwnerUserId} />
        </div>
        {canPickMode && (
          <div className="space-y-2">
            <Label htmlFor="kr-progress-mode">Modo de progreso</Label>
            <select
              id="kr-progress-mode"
              value={progressMode}
              onChange={(e) => setProgressMode(e.target.value as 'manual' | 'automatic')}
              disabled={loading}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="manual">Manual — el avance se mide con tareas</option>
              <option value="automatic">Automático — el avance viene de un indicador</option>
            </select>
            {progressMode === 'automatic' && props.periodId && (
              <KrMetricLinkFields
                orgId={props.orgId}
                periodId={props.periodId}
                value={linkValue}
                onChange={setLinkValue}
                mode="link"
                disabled={loading}
              />
            )}
          </div>
        )}
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
              : 'Crear Resultado Clave'}
          </Button>
        </DialogFooter>
      </form>
      {title.trim() && (
        <div className="mt-4">
          <SmartFeedbackPanel orgId={props.orgId} entityType="key_result" text={title} aiEnabled={aiEnabled} />
        </div>
      )}
    </DialogContent>
  );

  // Edit or externally-controlled create: no trigger.
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
        <Button size="sm">+ Nuevo Resultado Clave</Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
