'use client';

import { useState } from 'react';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateAiAction, type SmartFeedback, type AiError } from '@/components/objectives/actions';
import { AiErrorBlock } from './ai-error-block';

interface SmartFeedbackPanelProps {
  orgId: string;
  entityType: 'objective' | 'key_result';
  text: string;
  aiEnabled?: boolean;
}

export function SmartFeedbackPanel({
  orgId,
  entityType,
  text,
  aiEnabled = true,
}: SmartFeedbackPanelProps) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<SmartFeedback | null>(null);
  const [error, setError] = useState<AiError | null>(null);

  if (!aiEnabled) return null;

  async function run() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setFeedback(null);

    const result = await validateAiAction({ orgId, entityType, text: text.trim() });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setFeedback(result.feedback ?? null);
  }

  if (!feedback && !loading && !error) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={!text.trim()}
      >
        Validar SMART
      </Button>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3 animate-pulse"
        aria-label="Evaluando con AI..."
        role="status"
      >
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 bg-neutral-200 rounded" />
          <div className="h-4 w-32 bg-neutral-200 rounded" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="w-4 h-4 bg-neutral-200 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-24 bg-neutral-200 rounded" />
                <div className="h-2 w-full bg-neutral-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <AiErrorBlock code={error.code} message={error.message} orgId={orgId} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setError(null)}
        >
          Cerrar
        </Button>
      </div>
    );
  }

  if (!feedback) return null;

  const verdictColors: Record<SmartFeedback['verdict'], string> = {
    excelente: 'bg-green-100 text-green-800',
    bueno: 'bg-primary-100 text-primary-800',
    mejorable: 'bg-amber-100 text-amber-800',
    insuficiente: 'bg-red-100 text-red-800',
  };

  const criteriaLabels = {
    specific: 'Específico',
    measurable: 'Medible',
    achievable: 'Alcanzable',
    relevant: 'Relevante',
    timeBound: 'Temporal',
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${verdictColors[feedback.verdict]}`}
          >
            {feedback.verdict.toUpperCase()}
          </span>
          <span className="text-sm text-neutral-600">
            Puntaje: <strong>{feedback.overallScore}</strong>/100
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFeedback(null)}>
          Cerrar
        </Button>
      </div>

      <div className="space-y-2">
        {(
          Object.entries(feedback.criteria) as Array<
            [keyof typeof criteriaLabels, { score: number; feedback: string }]
          >
        ).map(([key, val]) => {
          const Icon =
            val.score >= 70 ? CheckCircle2 : val.score >= 40 ? AlertCircle : XCircle;
          const iconColor =
            val.score >= 70
              ? 'text-green-600'
              : val.score >= 40
              ? 'text-amber-600'
              : 'text-red-600';
          return (
            <div key={key} className="flex gap-2 text-sm">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-800">{criteriaLabels[key]}</span>
                  <span className="text-xs text-neutral-500 font-mono">{val.score}/100</span>
                </div>
                <p className="text-xs text-neutral-600 mt-0.5">{val.feedback}</p>
              </div>
            </div>
          );
        })}
      </div>

      {feedback.suggestions.length > 0 && (
        <div className="pt-3 border-t border-neutral-200">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Sugerencias
          </h4>
          <ul className="space-y-1">
            {feedback.suggestions.map((s, i) => (
              <li key={i} className="text-sm text-neutral-700 flex gap-2">
                <span className="text-primary-600" aria-hidden="true">
                  →
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
