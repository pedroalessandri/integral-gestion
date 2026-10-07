'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SetSiblingWeightsDto } from '@gestion-publica/shared-types/okr';
import { TOTAL_WEIGHT_BP, bpToPercentInput, equalSplitBp, parsePercentToBp, sumDraftBp } from './weights';

export interface WeightItem {
  id: string;
  label: string;
  weightBp: number | null;
}

/**
 * Borrador editable de los pesos de un grupo de hermanos (RN-P7). Al activar "Ponderar" arranca con el reparto
 * equitativo; al editar, con los pesos actuales. Los valores se escriben en porcentaje (hasta 2 decimales).
 */
export function useWeightDraft(items: WeightItem[], startEqual: boolean) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const split = equalSplitBp(items.length);
    return Object.fromEntries(
      items.map((item, i) => [
        item.id,
        bpToPercentInput(startEqual || item.weightBp === null ? (split[i] ?? 0) : item.weightBp),
      ]),
    );
  });

  const setDraft = useCallback((id: string, value: string) => setDrafts((d) => ({ ...d, [id]: value })), []);

  const equalize = useCallback(() => {
    const split = equalSplitBp(items.length);
    setDrafts(Object.fromEntries(items.map((item, i) => [item.id, bpToPercentInput(split[i] ?? 0)])));
  }, [items]);

  const totalBp = useMemo(() => sumDraftBp(items.map((i) => drafts[i.id] ?? '')), [items, drafts]);
  const invalidIds = useMemo(
    () => new Set(items.filter((i) => parsePercentToBp(drafts[i.id] ?? '') === null).map((i) => i.id)),
    [items, drafts],
  );
  const isValid = totalBp === TOTAL_WEIGHT_BP;

  const toPayload = useCallback((): SetSiblingWeightsDto | null => {
    if (!isValid) return null;
    return { weights: items.map((i) => ({ id: i.id, weightBp: parsePercentToBp(drafts[i.id] ?? '') ?? 0 })) };
  }, [isValid, items, drafts]);

  return { drafts, setDraft, equalize, totalBp, invalidIds, isValid, toPayload };
}
