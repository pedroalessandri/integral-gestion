'use client';

import { useState } from 'react';
import { Gauge, Plus } from 'lucide-react';
import type { MetricSummaryDto, ObjectiveIndicatorDto } from '@gestion-publica/shared-types/metrics';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import type { ActionResult } from '@/features/planning/error-messages';
import { WeightsControl } from '@/features/projects/components/weights-control';
import { LABELS } from '@/lib/labels';
import type { IndicatorChartData } from '../indicator-actions';
import { useObjectiveIndicators } from '../useObjectiveIndicators';
import { DeleteIndicatorDialog } from './delete-indicator-dialog';
import { IndicatorCard } from './indicator-card';
import { IndicatorFormDialog } from './indicator-form-dialog';

interface Props {
  orgId: string;
  objective: { id: string };
  indicators: ObjectiveIndicatorDto[];
  /** Gráfico y cargas por `metricId`; `null` si el módulo de métricas no está habilitado para la organización. */
  chartsByMetricId: Record<string, ActionResult<IndicatorChartData>> | null;
  /** Métricas del período del objetivo que todavía no son indicadores de él. */
  availableMetrics: MetricSummaryDto[];
  catalogError: string | null;
  /** Período cerrado: solo lectura. */
  readOnly: boolean;
  loadError?: string | null;
}

type DialogState =
  | { type: 'create' }
  | { type: 'edit'; indicator: ObjectiveIndicatorDto }
  | { type: 'delete'; indicator: ObjectiveIndicatorDto }
  | null;

export function ObjectiveIndicatorsPanel({
  orgId,
  objective,
  indicators,
  chartsByMetricId,
  availableMetrics,
  catalogError,
  readOnly,
  loadError,
}: Props) {
  const s = useObjectiveIndicators(orgId, objective.id, indicators);
  const [dialog, setDialog] = useState<DialogState>(null);

  function open(next: DialogState) {
    s.clearError();
    setDialog(next);
  }
  function close() {
    s.clearError();
    setDialog(null);
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  const newButton = !readOnly && (
    <Button onClick={() => open({ type: 'create' })}>
      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
      Nuevo indicador
    </Button>
  );

  const editing = dialog?.type === 'edit' ? dialog.indicator : null;
  const editingMetric =
    editing && chartsByMetricId?.[editing.metricId]?.ok
      ? (chartsByMetricId[editing.metricId] as { ok: true; data: IndicatorChartData }).data.metric
      : null;

  return (
    <div className="space-y-5">
      {indicators.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Aún no hay indicadores"
          description={
            readOnly
              ? 'Este objetivo no tiene indicadores.'
              : 'Los indicadores miden el avance de resultado del objetivo contra una meta. Creá el primero.'
          }
          action={newButton || undefined}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <WeightsControl
              noun={LABELS.indicator.plural.toLowerCase()}
              mode={s.weights.mode}
              items={indicators.map((i) => ({ id: i.id, label: i.metricName, weightBp: i.weightBp }))}
              pending={s.weights.pending}
              error={s.weights.error}
              readOnly={readOnly}
              onSave={s.weights.saveWeights}
              onClear={s.weights.clearWeights}
              onClearError={s.weights.clearError}
            />
            {newButton}
          </div>
          <ul className="space-y-3">
            {indicators.map((indicator) => (
              <IndicatorCard
                key={indicator.id}
                orgId={orgId}
                indicator={indicator}
                chart={chartsByMetricId?.[indicator.metricId] ?? null}
                readOnly={readOnly}
                defaultOpen={indicators.length === 1}
                onEdit={() => open({ type: 'edit', indicator })}
                onDelete={() => open({ type: 'delete', indicator })}
              />
            ))}
          </ul>
        </>
      )}

      {dialog?.type === 'create' && (
        <IndicatorFormDialog
          indicator={null}
          metric={null}
          availableMetrics={availableMetrics}
          catalogError={catalogError}
          groupWeighted={s.weights.mode === 'weighted'}
          pending={s.pending}
          error={s.error}
          onSubmit={s.createIndicator}
          onClose={close}
        />
      )}
      {editing && (
        <IndicatorFormDialog
          indicator={editing}
          metric={editingMetric}
          availableMetrics={[]}
          catalogError={null}
          groupWeighted={false}
          pending={s.pending}
          error={s.error}
          onSubmit={(values) =>
            s.updateIndicator(
              editing,
              {
                kind: editing.kind,
                source: editingMetric?.source ?? null,
                description: editingMetric?.description ?? null,
              },
              values,
            )
          }
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteIndicatorDialog
          indicator={dialog.indicator}
          pending={s.pending}
          error={s.error}
          onConfirm={async () => {
            if (await s.deleteIndicator(dialog.indicator)) close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
