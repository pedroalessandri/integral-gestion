'use client';

import { AlertTriangle } from 'lucide-react';
import type { AxisDto } from '@gestion-publica/shared-types/planning';
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

interface Props {
  axis: AxisDto;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteAxisDialog({ axis, pending, error, onConfirm, onClose }: Props) {
  const n = axis.objectiveCount;
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {LABELS.axis.singular.toLowerCase()}?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a eliminar el {LABELS.axis.singular.toLowerCase()} <strong>{axis.name}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {n > 0 && (
          <div
            role="alert"
            className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm font-medium">
              {n === 1
                ? `Este eje tiene 1 objetivo estratégico asignado. Va a quedar sin eje.`
                : `Este eje tiene ${n} objetivos estratégicos asignados. Van a quedar sin eje.`}
            </p>
          </div>
        )}
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            className="bg-red-600 hover:bg-red-700"
          >
            {pending ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
