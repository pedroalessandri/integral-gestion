'use client';

import type { MemberDto } from '@gestion-publica/shared-types/core';
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
  unitName: string;
  pending: boolean;
  error: string | null;
  blockingMembers: MemberDto[];
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteOrgUnitDialog({ unitName, pending, error, blockingMembers, onConfirm, onClose }: Props) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar unidad?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a eliminar <strong>{unitName}</strong>. Solo se puede si no tiene unidades dependientes,
            objetivos ni miembros asignados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded p-3 space-y-2">
            <p className="text-red-700 text-sm">{error}</p>
            {blockingMembers.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-red-700">
                {blockingMembers.map((m) => (
                  <li key={m.userId}>{m.displayName}</li>
                ))}
              </ul>
            )}
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
