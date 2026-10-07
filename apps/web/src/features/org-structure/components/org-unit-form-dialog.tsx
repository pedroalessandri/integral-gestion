'use client';

import { useState } from 'react';
import type { OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LABELS, ORG_UNIT_KIND_LABELS } from '@/lib/labels';
import { toCreateDto, toUpdateDto, type OrgUnitFormValues } from '../org-unit-form';
import { allowedChildKinds, candidateParents, type EditableKind, type FlatUnit } from '../tree';
import type { CreateOrgUnitDto, UpdateOrgUnitDto } from '@gestion-publica/shared-types/core';

type Props = {
  tree: OrgUnitTreeNodeDto[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
} & (
  | { mode: 'create'; parent: FlatUnit; onSubmit: (dto: CreateOrgUnitDto) => Promise<boolean> }
  | { mode: 'edit'; unit: OrgUnitTreeNodeDto; onSubmit: (dto: UpdateOrgUnitDto) => Promise<boolean> }
);

const selectClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50';

export function OrgUnitFormDialog(props: Props) {
  const { tree, pending, error, onClose } = props;
  const editing = props.mode === 'edit' ? props.unit : null;
  const isCentral = editing?.kind === 'central';

  const [values, setValues] = useState<OrgUnitFormValues>(() =>
    props.mode === 'edit'
      ? {
          name: props.unit.name,
          kind: props.unit.kind === 'central' ? 'ministry' : props.unit.kind,
          parentId: props.unit.parentId ?? '',
          vision: props.unit.vision ?? '',
          mission: props.unit.mission ?? '',
        }
      : {
          name: '',
          kind: allowedChildKinds(props.parent.node.kind)[0] ?? 'area',
          parentId: props.parent.node.id,
          vision: '',
          mission: '',
        },
  );
  const set = <K extends keyof OrgUnitFormValues>(key: K, value: OrgUnitFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const parents: FlatUnit[] = editing
    ? candidateParents(tree, editing)
    : props.mode === 'create'
      ? [props.parent]
      : [];
  const selectedParent = parents.find((p) => p.node.id === values.parentId);
  const kindOptions: EditableKind[] = selectedParent ? allowedChildKinds(selectedParent.node.kind) : ['ministry', 'area'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (props.mode === 'edit') {
      const dto = toUpdateDto(props.unit, values);
      if (Object.keys(dto).length === 0) {
        onClose();
        return;
      }
      if (await props.onSubmit(dto)) onClose();
    } else if (await props.onSubmit(toCreateDto(values))) {
      onClose();
    }
  }

  const title = props.mode === 'create' ? 'Nueva unidad' : `Editar ${editing?.name ?? 'unidad'}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {props.mode === 'create'
              ? `Se crea dentro de ${props.parent.node.name}.`
              : 'Modificá los datos de la unidad, incluidas su visión y misión.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unit-name">Nombre</Label>
            <Input
              id="unit-name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej: Secretaría de Obras Públicas"
              required
              maxLength={200}
            />
          </div>

          {!isCentral && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unit-kind">Tipo</Label>
                <select
                  id="unit-kind"
                  value={values.kind}
                  onChange={(e) => set('kind', e.target.value as EditableKind)}
                  className={selectClass}
                >
                  {kindOptions.map((k) => (
                    <option key={k} value={k}>
                      {ORG_UNIT_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              {props.mode === 'edit' && (
                <div className="space-y-2">
                  <Label htmlFor="unit-parent">Depende de</Label>
                  <select
                    id="unit-parent"
                    value={values.parentId}
                    onChange={(e) => {
                      const parent = parents.find((p) => p.node.id === e.target.value);
                      const allowed = parent ? allowedChildKinds(parent.node.kind) : [];
                      setValues((v) => ({
                        ...v,
                        parentId: e.target.value,
                        kind: allowed.includes(v.kind) ? v.kind : (allowed[0] ?? v.kind),
                      }));
                    }}
                    className={selectClass}
                  >
                    {parents.map((p) => (
                      <option key={p.node.id} value={p.node.id}>
                        {'— '.repeat(p.depth - 1)}
                        {p.node.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="unit-vision">{LABELS.vision} (opcional)</Label>
            <Textarea
              id="unit-vision"
              value={values.vision}
              onChange={(e) => set('vision', e.target.value)}
              placeholder="Cómo se imagina esta unidad en el futuro..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-mission">{LABELS.mission} (opcional)</Label>
            <Textarea
              id="unit-mission"
              value={values.mission}
              onChange={(e) => set('mission', e.target.value)}
              placeholder="Para qué existe esta unidad..."
              rows={3}
            />
          </div>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || values.name.trim() === ''}>
              {pending ? 'Guardando...' : props.mode === 'create' ? 'Crear unidad' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
