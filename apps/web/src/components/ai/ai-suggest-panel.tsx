'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { draftAiAction, type AiError } from '@/components/objectives/actions';
import { AiErrorBlock } from './ai-error-block';

interface AiSuggestPanelProps {
  orgId: string;
  entityType: 'objective' | 'key_result';
  objectiveContext?: string;
  onAccept: (suggestion: string) => void;
  aiEnabled?: boolean;
}

export function AiSuggestPanel({
  orgId,
  entityType,
  objectiveContext,
  onAccept,
  aiEnabled = true,
}: AiSuggestPanelProps) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<AiError | null>(null);

  if (!aiEnabled) return null;

  async function generate() {
    if (!hint.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);

    const result = await draftAiAction({ orgId, entityType, hint: hint.trim(), objectiveContext });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSuggestion(result.text ?? null);
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-primary-700 hover:text-primary-800 hover:bg-primary-50"
      >
        <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
        Sugerir con AI
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-primary-900">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          Asistente AI
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:text-neutral-700"
        >
          Cerrar
        </button>
      </div>

      {!suggestion && (
        <>
          <Textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder={
              entityType === 'objective'
                ? 'Qué querés lograr (en una frase informal)...'
                : 'Qué métrica querés medir...'
            }
            rows={2}
            maxLength={500}
            className="bg-white"
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={generate} disabled={loading || !hint.trim()}>
              {loading ? 'Generando...' : 'Generar sugerencia'}
            </Button>
          </div>
          {loading && (
            <div className="h-8 bg-neutral-100 rounded animate-pulse" aria-label="Generando sugerencia..." />
          )}
        </>
      )}

      {suggestion && (
        <>
          <div className="bg-white rounded-md border border-neutral-200 p-3">
            <p className="text-sm text-neutral-900">{suggestion}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={loading}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Volver a generar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAccept(suggestion);
                setOpen(false);
                setSuggestion(null);
                setHint('');
              }}
            >
              Usar esta sugerencia
            </Button>
          </div>
        </>
      )}

      {error && <AiErrorBlock code={error.code} message={error.message} orgId={orgId} />}
    </div>
  );
}
