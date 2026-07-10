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
import { KrMetricLinkDialog } from './kr-metric-link-dialog';
import { deleteKrAction, unlinkKrMetricAction } from './actions';
import type { MetricKrLinkDto } from '@gestion-publica/shared-types/metrics';

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
  /** M2: metric-link management is offered only when 'indicadores-okr' is enabled. */
  indicadoresOkrEnabled?: boolean;
  /** Period id — required to scope the metric selector (RN-O3). */
  periodId?: string;
  /** 'automatic' when the KR is driven by an indicator. */
  progressMode?: 'manual' | 'automatic';
  /** The embedded link when the KR is automatic. */
  metricLink?: MetricKrLinkDto | null;
}

export function KrCardActions({
  orgId,
  objectiveId,
  kr,
  aiEnabled = true,
  periodStartsAt,
  periodEndsAt,
  indicadoresOkrEnabled = false,
  periodId,
  progressMode = 'manual',
  metricLink = null,
}: Props) {
  const router = useRouter();
  // Controlled menu: force-close before opening a dialog so the kebab doesn't
  // stay visible/focused after the dialog closes (known bug).
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editLinkOpen, setEditLinkOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const isAutomatic = progressMode === 'automatic';
  const canManageLink = indicadoresOkrEnabled && !!periodId;
  const lastPct = metricLink ? (metricLink.computedProgressBp / 100).toFixed(1) : '0.0';

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

  async function handleUnlink() {
    setUnlinking(true);
    setUnlinkError(null);
    const result = await unlinkKrMetricAction({ orgId, krId: kr.id });
    setUnlinking(false);
    if (result.error) {
      setUnlinkError(result.error);
      return;
    }
    setUnlinkOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
              setMenuOpen(false);
              setNewTaskOpen(true);
            }}
            className="font-semibold"
          >
            + Nueva tarea
          </DropdownMenuItem>

          {canManageLink && (
            <>
              <DropdownMenuSeparator />
              {isAutomatic ? (
                <>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                      setEditLinkOpen(true);
                    }}
                  >
                    Editar vínculo…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                      setUnlinkOpen(true);
                    }}
                  >
                    Desvincular indicador
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    setLinkOpen(true);
                  }}
                >
                  Vincular indicador…
                </DropdownMenuItem>
              )}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              setEditOpen(true);
            }}
          >
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
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

      {canManageLink && periodId && (
        <>
          <KrMetricLinkDialog
            orgId={orgId}
            krId={kr.id}
            periodId={periodId}
            open={linkOpen}
            onOpenChange={setLinkOpen}
            mode="link"
          />
          <KrMetricLinkDialog
            orgId={orgId}
            krId={kr.id}
            periodId={periodId}
            open={editLinkOpen}
            onOpenChange={setEditLinkOpen}
            mode="edit"
            initialLink={metricLink}
          />
        </>
      )}

      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular el indicador?</AlertDialogTitle>
            <AlertDialogDescription>
              El Resultado Clave <strong>{kr.title}</strong> volverá a modo <strong>manual</strong> y
              conservará su último porcentaje calculado (<strong>{lastPct}%</strong>). El indicador
              dejará de actualizar su avance; después podrás volver a medirlo con tareas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {unlinkError && <p className="text-sm text-red-600">{unlinkError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlink} disabled={unlinking}>
              {unlinking ? 'Desvinculando...' : 'Desvincular'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
