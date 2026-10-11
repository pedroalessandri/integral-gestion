'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLabels } from '@/lib/labels/labels-provider';
import type { ActionFailure, ActionResult } from './error-messages';
import { resolveSectorError } from './sector-errors';

/**
 * Ejecuta una server action de mutación, maneja pending/error y refresca los Server Components
 * cuando sale bien. Devuelve el resultado para que el caller cierre el dialog o reaccione a `code`.
 */
export function useActionRunner() {
  const router = useRouter();
  const { errors } = useLabels();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      setPending(true);
      setError(null);
      const result = await action();
      setPending(false);
      if (result.ok) {
        router.refresh();
        return result;
      }
      // Los códigos con vocabulario de sector se muestran con el texto del diccionario de la org (ADR-0011 D3).
      const error = resolveSectorError(errors, result.code, result.error);
      setError(error);
      return { ...result, error };
    },
    [router, errors],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, run, clearError };
}

export function isFailure<T>(result: ActionResult<T>): result is ActionFailure {
  return !result.ok;
}
