'use client';

import type { TaskSummaryDto } from '@gestion-publica/shared-types/okr';
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

interface Props {
  task: Pick<TaskSummaryDto, 'title'>;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteTaskDialog({ task, pending, error, onConfirm, onClose }: Props) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar tarea?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a eliminar la tarea <strong>{task.title}</strong>. El avance del proyecto se recalcula.
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
