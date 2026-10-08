'use client';

import type { ObjectiveIndicatorDto } from '@gestion-publica/shared-types/metrics';
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
  indicator: Pick<ObjectiveIndicatorDto, 'metricName'>;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteIndicatorDialog({ indicator, pending, error, onConfirm, onClose }: Props) {
  const noun = LABELS.indicator.singular.toLowerCase();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar {noun} del objetivo?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a quitar <strong>{indicator.metricName}</strong> de este objetivo. La métrica y sus cargas se conservan
            y el avance de resultado se recalcula.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
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
            {pending ? 'Quitando...' : 'Quitar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
