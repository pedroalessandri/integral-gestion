'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { CreateKrButton } from './create-kr-button';
import { CreateTaskButton } from './create-task-button';
import { deleteKrAction } from './actions';

interface KrData {
  id: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp: number;
}

interface Props {
  orgId: string;
  objectiveId: string;
  kr: KrData;
  aiEnabled?: boolean;
  /** Period bounds — forwarded to the "Nueva tarea" dialog. */
  periodStartsAt?: string;
  periodEndsAt?: string;
}

export function KrCardActions({
  orgId,
  objectiveId,
  kr,
  aiEnabled = true,
  periodStartsAt,
  periodEndsAt,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteKrAction({ orgId, krId: kr.id });
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Acciones del Resultado Clave"
            className="h-7 w-7 p-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setNewTaskOpen(true);
            }}
            className="font-semibold"
          >
            + Nueva tarea
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setEditOpen(true);
            }}
          >
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
            className="text-red-600 focus:text-red-600"
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateTaskButton
        orgId={orgId}
        keyResultId={kr.id}
        periodStartsAt={periodStartsAt}
        periodEndsAt={periodEndsAt}
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
      />

      <CreateKrButton
        orgId={orgId}
        objectiveId={objectiveId}
        mode="edit"
        initialValues={kr}
        open={editOpen}
        onOpenChange={setEditOpen}
        aiEnabled={aiEnabled}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Resultado Clave?</AlertDialogTitle>
            <AlertDialogDescription>
              El Resultado Clave <strong>{kr.title}</strong> y todas sus tareas se moverán a la papelera. Podés
              restaurarlos desde la papelera de la organización.
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
    </>
  );
}
