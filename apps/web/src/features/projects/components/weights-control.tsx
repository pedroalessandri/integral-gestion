'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { SetSiblingWeightsDto } from '@gestion-publica/shared-types/okr';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LABELS } from '@/lib/labels';
import type { WeightItem } from '../useWeightDraft';
import type { WeightGroupMode } from '../weights';
import { WeightsDialog } from './weights-dialog';

interface Props {
  /** Qué se pondera, en plural minúscula: "proyectos" | "tareas". */
  noun: string;
  mode: WeightGroupMode;
  items: WeightItem[];
  pending: boolean;
  error: string | null;
  readOnly: boolean;
  onSave: (input: SetSiblingWeightsDto) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  onClearError: () => void;
}

type Dialog = 'enable' | 'edit' | 'disable' | null;

/** Toggle "Ponderar" de un grupo de hermanos + edición de pesos en bloque (RN-P6/RN-P7). */
export function WeightsControl({ noun, mode, items, pending, error, readOnly, onSave, onClear, onClearError }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const weighted = mode === 'weighted';
  const canToggle = !readOnly && mode !== 'empty';

  function open(next: Dialog) {
    onClearError();
    setDialog(next);
  }
  function close() {
    onClearError();
    setDialog(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={weighted}
            aria-label={`${LABELS.weighting.toggle} ${noun}`}
            disabled={!canToggle || pending}
            title={mode === 'empty' ? `Agregá ${noun} para poder ponderarlos` : undefined}
            onClick={() => open(weighted ? 'disable' : 'enable')}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              weighted ? 'bg-emerald-600' : 'bg-neutral-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                weighted ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="text-sm text-neutral-700">{LABELS.weighting.toggle}</span>
        </div>
        {weighted && !readOnly && (
          <Button variant="outline" size="sm" onClick={() => open('edit')} disabled={pending}>
            {LABELS.weighting.editWeights}
          </Button>
        )}
        {!weighted && mode !== 'empty' && <span className="text-xs text-neutral-500">{LABELS.weighting.unweighted}</span>}
      </div>

      {mode === 'mixed' && (
        <div role="alert" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">
            Algunos {noun} tienen peso y otros no. Activá <strong>{LABELS.weighting.toggle}</strong> para asignarlos
            todos juntos, o quitá los pesos.
          </p>
        </div>
      )}
      {error && dialog === null && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {(dialog === 'enable' || dialog === 'edit') && (
        <WeightsDialog
          title={dialog === 'enable' ? `Ponderar ${noun}` : `Editar pesos de ${noun}`}
          description={
            dialog === 'enable'
              ? `Proponemos un reparto en partes iguales; ajustalo como quieras. Los pesos de todos los ${noun} tienen que sumar 100 %.`
              : `Los pesos de todos los ${noun} tienen que sumar 100 %.`
          }
          items={items}
          startEqual={dialog === 'enable'}
          pending={pending}
          error={error}
          onSubmit={onSave}
          onClose={close}
        />
      )}
      {dialog === 'disable' && (
        <AlertDialog open onOpenChange={(o) => !o && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Quitar la ponderación?</AlertDialogTitle>
              <AlertDialogDescription>
                Se van a borrar los pesos de todos los {noun} y el avance pasa a ser el promedio simple.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={async (e) => {
                  e.preventDefault();
                  if (await onClear()) close();
                }}
              >
                {pending ? 'Quitando...' : 'Quitar pesos'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
