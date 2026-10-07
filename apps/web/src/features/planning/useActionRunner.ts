'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionFailure, ActionResult } from './error-messages';

/**
 * Ejecuta una server action de mutación, maneja pending/error y refresca los Server Components
 * cuando sale bien. Devuelve el resultado para que el caller cierre el dialog o reaccione a `code`.
 */
export function useActionRunner() {
  const router = useRouter();
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
      } else {
        setError(result.error);
      }
      return result;
    },
    [router],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, run, clearError };
}

export function isFailure<T>(result: ActionResult<T>): result is ActionFailure {
  return !result.ok;
}
