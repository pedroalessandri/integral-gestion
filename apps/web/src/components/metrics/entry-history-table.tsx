'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { MetricEntryDto, MetricUnit } from '@gestion-publica/shared-types/metrics';
import { formatMetricValue, formatBucketLabel } from './format';
import { updateEntryAction, deleteEntryAction } from './actions';

interface Props {
  orgId: string;
  metricId: string;
  entries: MetricEntryDto[];
  unit: MetricUnit;
  readOnly: boolean;
}

export function EntryHistoryTable({ orgId, metricId, entries, unit, readOnly }: Props) {
  if (entries.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-6 text-center"
        style={{ borderColor: 'var(--color-neutral-200)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
          Sin cargas todavía.
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--color-neutral-400)' }}>
          {readOnly
            ? 'Este período cerró sin cargas registradas para el indicador.'
            : 'Cargá el primer avance desde el panel de la derecha.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'white', border: '1px solid var(--color-neutral-200)' }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
            <Th>Fecha</Th>
            <Th>Bucket</Th>
            <Th className="text-right">Incremento</Th>
            <Th className="text-right">Acumulado</Th>
            <Th>Comentario</Th>
            <Th>Usuario</Th>
            {!readOnly && <Th className="w-10">{''}</Th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-neutral-100)' }}>
              <Td className="whitespace-nowrap" style={{ color: 'var(--color-neutral-500)' }}>
                {new Date(entry.createdAt).toLocaleDateString('es-AR')}
              </Td>
              <Td className="whitespace-nowrap">{formatBucketLabel(entry.bucketDate)}</Td>
              <Td className="text-right font-mono" style={{ color: 'var(--color-neutral-900)' }}>
                {formatMetricValue(entry.incrementValue, unit)}
              </Td>
              <Td className="text-right font-mono" style={{ color: 'var(--color-neutral-500)' }}>
                {formatMetricValue(entry.cumulativeAfter, unit)}
              </Td>
              <Td style={{ color: 'var(--color-neutral-600)' }}>{entry.comment ?? '—'}</Td>
              <Td className="whitespace-nowrap" style={{ color: 'var(--color-neutral-500)' }}>
                {entry.createdBy?.displayName ?? '—'}
              </Td>
              {!readOnly && (
                <Td className="text-right">
                  <EntryRowActions orgId={orgId} metricId={metricId} entry={entry} />
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryRowActions({
  orgId,
  metricId,
  entry,
}: {
  orgId: string;
  metricId: string;
  entry: MetricEntryDto;
}) {
  const router = useRouter();
  // Controlled menu so it closes before a dialog opens (avoids the stuck-menu bug).
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [increment, setIncrement] = useState(entry.incrementValue);
  const [comment, setComment] = useState(entry.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateEntryAction({
      orgId,
      metricId,
      entryId: entry.id,
      incrementValue: increment,
      comment,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    const result = await deleteEntryAction({ orgId, metricId, entryId: entry.id });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Acciones de la carga" className="h-7 w-7 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              setIncrement(entry.incrementValue);
              setComment(entry.comment ?? '');
              setEditOpen(true);
            }}
          >
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar carga · {formatBucketLabel(entry.bucketDate)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-inc-${entry.id}`}>Incremento</Label>
              <Input
                id={`edit-inc-${entry.id}`}
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
                inputMode="decimal"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-com-${entry.id}`}>Comentario</Label>
              <Textarea
                id={`edit-com-${entry.id}`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta carga?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el incremento del bucket {formatBucketLabel(entry.bucketDate)}. El acumulado se recalcula.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs uppercase tracking-wider font-medium ${className ?? ''}`}
      style={{ color: 'var(--color-neutral-500)' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-3 py-2 ${className ?? ''}`} style={style}>
      {children}
    </td>
  );
}
