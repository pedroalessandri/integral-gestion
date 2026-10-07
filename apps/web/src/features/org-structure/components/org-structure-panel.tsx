'use client';

import { useState } from 'react';
import { Building2, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MemberDto, OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { LABELS, ORG_UNIT_KIND_LABELS, SCOPE_WHOLE_ORG_LABEL } from '@/lib/labels';
import { useOrgStructure } from '../useOrgStructure';
import { canAddChild, flattenTree, type FlatUnit } from '../tree';
import { OrgUnitFormDialog } from './org-unit-form-dialog';
import { DeleteOrgUnitDialog } from './delete-org-unit-dialog';

interface Props {
  orgId: string;
  tree: OrgUnitTreeNodeDto[];
  members: MemberDto[];
  /** Error al cargar el árbol (el panel muestra un Alert en vez de la lista). */
  loadError?: string | null;
  /** Error al cargar los miembros: el árbol se puede editar igual, pero no el alcance. */
  membersError?: string | null;
}

type DialogState =
  | { type: 'create'; parent: FlatUnit }
  | { type: 'edit'; unit: FlatUnit }
  | { type: 'delete'; unit: FlatUnit }
  | null;

const selectClass = 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50';

export function OrgStructurePanel({ orgId, tree, members, loadError, membersError }: Props) {
  const s = useOrgStructure({ orgId, tree, members });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [scopeUserId, setScopeUserId] = useState<string | null>(null);

  function open(next: DialogState) {
    s.clearError();
    setDialog(next);
  }
  function close() {
    s.clearError();
    setDialog(null);
  }

  async function changeScope(userId: string, value: string) {
    setScopeUserId(userId);
    await s.setScope(userId, value === '' ? null : value);
    setScopeUserId(null);
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border p-4 bg-red-50 border-red-200">
        <p className="text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="units-heading">
        <div>
          <h2 id="units-heading" className="text-lg font-semibold text-neutral-900">
            {LABELS.unit.plural}
          </h2>
          <p className="text-sm text-neutral-500">
            Árbol de la organización, hasta 4 niveles. Cada unidad puede tener su {LABELS.vision.toLowerCase()} y{' '}
            {LABELS.mission.toLowerCase()}.
          </p>
        </div>

        {s.error && dialog === null && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm">{s.error}</p>
          </div>
        )}

        {tree.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Aún no hay unidades"
            description="La unidad central se crea automáticamente con la organización. Recargá la página; si el problema sigue, avisale a un administrador."
          />
        ) : (
          <ul className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
            {flattenTree(tree).map((unit) => (
              <li key={unit.node.id} className="p-3" style={{ paddingLeft: `${0.75 + (unit.depth - 1) * 1.5}rem` }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {unit.depth > 1 && <ChevronRight className="h-3.5 w-3.5 text-neutral-400" aria-hidden />}
                      <span className="font-medium text-neutral-900">{unit.node.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {ORG_UNIT_KIND_LABELS[unit.node.kind]}
                      </Badge>
                    </div>
                    {(unit.node.vision || unit.node.mission) && (
                      <dl className="text-xs text-neutral-600 space-y-0.5">
                        {unit.node.vision && (
                          <div>
                            <dt className="inline font-medium">{LABELS.vision}: </dt>
                            <dd className="inline">{unit.node.vision}</dd>
                          </div>
                        )}
                        {unit.node.mission && (
                          <div>
                            <dt className="inline font-medium">{LABELS.mission}: </dt>
                            <dd className="inline">{unit.node.mission}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canAddChild(unit)}
                      title={canAddChild(unit) ? undefined : 'Se alcanzó la profundidad máxima (4 niveles).'}
                      onClick={() => open({ type: 'create', parent: unit })}
                      aria-label={`Agregar unidad dentro de ${unit.node.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => open({ type: 'edit', unit })}
                      aria-label={`Editar ${unit.node.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {unit.node.kind !== 'central' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => open({ type: 'delete', unit })}
                        aria-label={`Eliminar ${unit.node.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="scope-heading">
        <div>
          <h2 id="scope-heading" className="text-lg font-semibold text-neutral-900">
            {LABELS.scope} de los miembros
          </h2>
          <p className="text-sm text-neutral-500">
            Definí en qué unidad trabaja cada miembro. &quot;{SCOPE_WHOLE_ORG_LABEL}&quot; equivale a la unidad central.
          </p>
        </div>
        {membersError ? (
          <div role="alert" className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm">{membersError}</p>
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay miembros. Invitá al primero desde Miembros.</p>
        ) : (
          <ul className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
            {members.map((m) => (
              <li key={m.userId} className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">{m.displayName}</p>
                  <p className="text-xs text-neutral-500">
                    {m.email} · {m.role.name}
                  </p>
                </div>
                <select
                  aria-label={`Alcance de ${m.displayName}`}
                  className={`${selectClass} w-full sm:w-64`}
                  value={m.orgUnitId ?? ''}
                  disabled={scopeUserId === m.userId}
                  onChange={(e) => void changeScope(m.userId, e.target.value)}
                >
                  <option value="">{SCOPE_WHOLE_ORG_LABEL}</option>
                  {s.units
                    .filter((u) => u.node.kind !== 'central')
                    .map((u) => (
                      <option key={u.node.id} value={u.node.id}>
                        {'— '.repeat(u.depth - 1)}
                        {u.node.name}
                      </option>
                    ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.type === 'create' && (
        <OrgUnitFormDialog
          mode="create"
          tree={tree}
          parent={dialog.parent}
          pending={s.pending}
          error={s.error}
          onSubmit={s.createUnit}
          onClose={close}
        />
      )}
      {dialog?.type === 'edit' && (
        <OrgUnitFormDialog
          mode="edit"
          tree={tree}
          unit={dialog.unit.node}
          pending={s.pending}
          error={s.error}
          onSubmit={(dto) => s.updateUnit(dialog.unit.node.id, dto)}
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteOrgUnitDialog
          unitName={dialog.unit.node.name}
          pending={s.pending}
          error={s.error}
          blockingMembers={s.blockingMembers}
          onConfirm={async () => {
            if (await s.deleteUnit(dialog.unit)) close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
