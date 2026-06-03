'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, AlertTriangle } from 'lucide-react';
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
import { closePeriodAction } from '@/components/objectives/actions';

interface ClosePeriodButtonProps {
  orgId: string;
  periodId: string;
  openPeriodCode: string;
}

export function ClosePeriodButton({ orgId, periodId, openPeriodCode }: ClosePeriodButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await closePeriodAction({ periodId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/orgs/${orgId}/periods/new`);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5"
          style={{ borderColor: 'var(--color-neutral-300)', color: 'var(--color-neutral-700)' }}
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          Cerrar período
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cerrar período {openPeriodCode}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm" style={{ color: 'var(--color-neutral-600)' }}>
              <p>
                Estás por cerrar el período <strong>{openPeriodCode}</strong>. Esta acción es manual y no abre ningún período nuevo de forma automática.
              </p>
              <div
                className="rounded-lg border p-3 space-y-1.5"
                style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="h-4 w-4 mt-0.5 shrink-0"
                    style={{ color: '#92400e' }}
                    aria-hidden="true"
                  />
                  <div className="space-y-1" style={{ color: '#78350f' }}>
                    <p className="font-medium">Consecuencias de esta acción:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      <li>
                        El período <strong>{openPeriodCode}</strong> quedará cerrado y sus objetivos,
                        Resultados Clave y tareas pasarán a ser <strong>histórico de solo lectura</strong>.
                      </li>
                      <li>
                        Para continuar trabajando, vas a tener que crear un nuevo período manualmente desde la sección de Períodos.
                      </li>
                      <li>Esta acción no se puede deshacer desde la UI.</li>
                    </ul>
                  </div>
                </div>
              </div>
              {error && (
                <div
                  className="rounded-lg border p-3"
                  style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
                >
                  <p className="text-xs font-mono" style={{ color: '#b91c1c' }}>
                    {error}
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isPending}
            style={{ backgroundColor: 'var(--color-primary-600)', color: 'white' }}
          >
            {isPending ? 'Cerrando...' : 'Cerrar período'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
