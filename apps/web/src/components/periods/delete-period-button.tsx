'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
import { deletePeriodAction } from '@/components/objectives/actions';

interface DeletePeriodButtonProps {
  orgId: string;
  periodId: string;
  periodCode: string;
}

export function DeletePeriodButton({ orgId, periodId, periodCode }: DeletePeriodButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const result = await deletePeriodAction({ periodId });

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push(`/orgs/${orgId}/periods`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50"
            disabled={loading}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {loading ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar período</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-neutral-600">
                <p>
                  Estás por eliminar el período{' '}
                  <strong className="font-mono">{periodCode}</strong>.
                </p>
                <p className="font-semibold text-red-700">
                  Esta acción eliminará en cascada todos los Objetivos, Resultados Clave y Tareas
                  asociados a este período. No se puede deshacer.
                </p>
                <p>
                  Si querés conservar los datos, cerrá el período en lugar de eliminarlo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Sí, eliminar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && (
        <p className="text-xs text-red-600 max-w-[200px] text-right">{error}</p>
      )}
    </div>
  );
}
