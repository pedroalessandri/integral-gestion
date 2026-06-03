'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play, AlertTriangle } from 'lucide-react';
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
import { activatePeriodAction } from '@/components/objectives/actions';

interface ActivatePeriodButtonProps {
  orgId: string;
  periodId: string;
  periodCode: string;
}

export function ActivatePeriodButton({ orgId, periodId, periodCode }: ActivatePeriodButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await activatePeriodAction({ periodId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/orgs/${orgId}/periods`);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5"
          style={{ borderColor: '#a7f3d0', color: '#065f46' }}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Activar ahora
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Activar período {periodCode}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm" style={{ color: 'var(--color-neutral-600)' }}>
              <p>
                Estás por activar el período <strong>{periodCode}</strong>, pasándolo de{' '}
                <em>futuro</em> a <em>abierto</em>. A partir de este momento podrás crear
                objetivos en él.
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
                    <p className="font-medium">Antes de continuar:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      <li>
                        Solo puede haber un período <strong>abierto</strong> a la vez en la
                        organización.
                      </li>
                      <li>
                        Si ya existe un período abierto, la activación va a fallar con un error
                        de conflicto.
                      </li>
                      <li>
                        Cerrá el período activo antes de activar este si corresponde.
                      </li>
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
            {isPending ? 'Activando...' : 'Activar período'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
