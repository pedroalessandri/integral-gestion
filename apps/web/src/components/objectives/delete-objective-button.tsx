'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { deleteObjectiveAction } from './actions';

interface Props {
  orgId: string;
  objectiveId: string;
  objectiveTitle: string;
}

export function DeleteObjectiveButton({ orgId, objectiveId, objectiveTitle }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteObjectiveAction({ orgId, objectiveId });
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    router.push('/objectives');
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Eliminar objetivo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar objetivo?</AlertDialogTitle>
          <AlertDialogDescription>
            El objetivo <strong>{objectiveTitle}</strong> y todos sus Resultados Clave y tareas se moverán a la
            papelera. Esta acción se puede revertir desde la papelera de la organización.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
