'use client';

import { useState } from 'react';
import { Lock, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import type { ObjectiveIndicatorDto, ProjectContributionDto } from '@gestion-publica/shared-types/metrics';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/empty-state';
import { formatMetricValue } from '@/components/metrics/format';
import { formatBpPercent } from '@/features/projects/weights';
import { CONTRIBUTION_LABELS as L } from '@/lib/labels';
import { isContributionLocked } from '../contributions';
import { useProjectContributions } from '../useProjectContributions';
import { ContributionFormDialog } from './contribution-form-dialog';

interface Props {
  orgId: string;
  projectId: string;
  /** Indicadores del objetivo del proyecto. */
  indicators: ObjectiveIndicatorDto[];
  contributions: ProjectContributionDto[];
  /** Si no se pudieron listar los aportes o los indicadores. */
  loadError: string | null;
  readOnly: boolean;
}

type DialogState =
  | { type: 'add' }
  | { type: 'edit'; contribution: ProjectContributionDto }
  | { type: 'remove'; contribution: ProjectContributionDto }
  | null;

/** Sección "Aporta a indicador" de la ficha de proyecto (RN-P12, RN-P13). */
export function ProjectContributionsSection({ orgId, projectId, indicators, contributions, loadError, readOnly }: Props) {
  const s = useProjectContributions(orgId, projectId, indicators, contributions);
  const [dialog, setDialog] = useState<DialogState>(null);

  function open(next: DialogState) {
    s.clearError();
    setDialog(next);
  }
  function close() {
    s.clearError();
    setDialog(null);
  }

  const canAdd = !readOnly && s.options.available.length > 0;
  const addButton = canAdd && (
    <Button onClick={() => open({ type: 'add' })}>
      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
      {L.add}
    </Button>
  );

  return (
    <section className="space-y-3" aria-labelledby="contributions-heading" data-testid="project-contributions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="contributions-heading" className="text-lg font-semibold text-neutral-900">
            {L.section}
          </h2>
          <p className="text-xs text-neutral-500">{L.sectionHint}</p>
        </div>
        {contributions.length > 0 && addButton}
      </div>

      {loadError ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {L.loadError} {loadError}
        </div>
      ) : (
        <>
          {contributions.length === 0 ? (
            s.options.noneEligible ? (
              <EmptyState icon={Target} title={L.noEligibleTitle} description={L.noEligible} />
            ) : (
              <EmptyState
                icon={Target}
                title={L.empty}
                description={readOnly ? L.empty : L.emptyCta}
                action={addButton || undefined}
              />
            )
          ) : (
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
              {contributions.map((c) => {
                const indicator = s.indicatorById(c.objectiveIndicatorId);
                const locked = isContributionLocked(c);
                const value = indicator ? formatMetricValue(c.contributionValue, indicator.unit) : c.contributionValue;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-sm">
                    <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                      <p className="break-words font-medium text-neutral-900">{s.indicatorName(c.objectiveIndicatorId)}</p>
                      <p className="text-xs text-neutral-500">
                        {locked ? L.appliedHint : L.pendingHint(formatBpPercent(c.projectProgressBp, 0))}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-neutral-900" title={L.value}>
                      {c.contributionValue.startsWith('-') ? '' : '+'}
                      {value}
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 gap-1 text-xs ${locked ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : ''}`}
                      data-testid={locked ? 'contribution-applied' : 'contribution-pending'}
                    >
                      {locked && <Lock className="h-3 w-3" aria-hidden />}
                      {locked ? L.applied : L.pending}
                    </Badge>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={locked}
                          title={locked ? L.lockedEdit : undefined}
                          aria-label={`Editar aporte a ${s.indicatorName(c.objectiveIndicatorId)}`}
                          onClick={() => open({ type: 'edit', contribution: c })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          disabled={locked}
                          title={locked ? L.lockedRemove : undefined}
                          aria-label={`${L.remove}: ${s.indicatorName(c.objectiveIndicatorId)}`}
                          onClick={() => open({ type: 'remove', contribution: c })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {contributions.some(isContributionLocked) && (
            <p className="flex items-start gap-1.5 text-xs text-neutral-600">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {L.lockedHint}
            </p>
          )}
          {contributions.length > 0 && s.options.allUsed && !readOnly && (
            <p className="text-xs text-neutral-500">{L.allUsed}</p>
          )}
        </>
      )}

      {(dialog?.type === 'add' || dialog?.type === 'edit') && (
        <ContributionFormDialog
          contribution={dialog.type === 'edit' ? dialog.contribution : null}
          available={s.options.available}
          editingIndicator={dialog.type === 'edit' ? s.indicatorById(dialog.contribution.objectiveIndicatorId) : null}
          pending={s.pending}
          error={s.error}
          onCreate={s.create}
          onUpdate={s.update}
          onClose={close}
        />
      )}
      {dialog?.type === 'remove' && (
        <AlertDialog open onOpenChange={(o) => !o && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{L.removeTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {L.removeDescription(s.indicatorName(dialog.contribution.objectiveIndicatorId))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {s.error && (
              <div role="alert" className="rounded border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{s.error}</p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={s.pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={s.pending}
                className="bg-red-600 hover:bg-red-700"
                onClick={async (e) => {
                  e.preventDefault();
                  if (await s.remove(dialog.contribution)) close();
                }}
              >
                {s.pending ? 'Quitando...' : 'Quitar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
