'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPeriodAction, type PeriodItem } from '@/components/objectives/actions';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayAsDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateStringPlusDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateEsAR(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toUtcMidnight(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  code?: string;
  startsAt?: string;
  endsAt?: string;
}

function validateForm(values: {
  code: string;
  startsAt: string;
  endsAt: string;
}): FormErrors {
  const errors: FormErrors = {};

  if (!values.code.trim()) {
    errors.code = 'Ingresá un nombre para el período';
  }

  if (!values.startsAt) {
    errors.startsAt = 'Seleccioná una fecha de inicio';
  }

  if (!values.endsAt) {
    errors.endsAt = 'Seleccioná una fecha de fin';
  } else if (values.startsAt && values.endsAt <= values.startsAt) {
    errors.endsAt = 'La fecha de fin debe ser posterior a la de inicio';
  } else if (values.startsAt) {
    const days = daysBetween(values.startsAt, values.endsAt);
    if (days < 7) {
      errors.endsAt = 'El período debe durar al menos 7 días';
    } else if (days > 366) {
      errors.endsAt = 'El período no puede superar los 366 días';
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NewPeriodFormProps {
  orgId: string;
  /** If set, the org already has an open period and the form submit must be disabled. */
  openPeriod: PeriodItem | null;
}

export function NewPeriodForm({ orgId, openPeriod }: NewPeriodFormProps) {
  const router = useRouter();
  const today = todayAsDateString();

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState(dateStringPlusDays(today, 90));

  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const hasOpenPeriod = openPeriod !== null;

  function handleCodeBlur() {
    if (code.trim()) return;

    if (
      startsAt &&
      endsAt &&
      endsAt > startsAt &&
      daysBetween(startsAt, endsAt) >= 7 &&
      daysBetween(startsAt, endsAt) <= 366
    ) {
      const suggested = `Período ${formatDateEsAR(startsAt)} - ${formatDateEsAR(endsAt)}`;
      setCode(suggested);
      if (submitAttempted) {
        setFieldErrors((prev) => ({ ...prev, code: undefined }));
      }
    } else if (submitAttempted) {
      setFieldErrors((prev) => ({ ...prev, code: 'Ingresá un nombre para el período' }));
    }
  }

  function handleFieldBlur(field: keyof FormErrors) {
    if (!submitAttempted) return;
    const errors = validateForm({ code, startsAt, endsAt });
    setFieldErrors((prev) => ({ ...prev, [field]: errors[field] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasOpenPeriod) return;

    setSubmitAttempted(true);
    setServerError(null);

    const errors = validateForm({ code, startsAt, endsAt });
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    const result = await createPeriodAction({
      orgId,
      code: code.trim(),
      startsAt: toUtcMidnight(startsAt),
      endsAt: toUtcMidnight(endsAt),
    });

    setLoading(false);

    if (result.error) {
      setServerError(result.error);
      return;
    }

    router.push('/objectives');
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Page header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" style={{ color: 'var(--color-primary-600)' }} aria-hidden="true" />
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Nuevo período
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
          Creá un nuevo período para empezar a registrar objetivos.
        </p>
      </div>

      {/* Open period banner */}
      {hasOpenPeriod && (
        <div
          className="rounded-lg border p-4 flex items-start gap-3"
          style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
          role="alert"
        >
          <AlertCircle
            className="h-5 w-5 mt-0.5 shrink-0"
            style={{ color: '#92400e' }}
            aria-hidden="true"
          />
          <div className="space-y-1 text-sm" style={{ color: '#78350f' }}>
            <p className="font-medium">
              Tu organización ya tiene un período activo (
              <code className="font-mono">{openPeriod.code}</code>, hasta{' '}
              {new Date(openPeriod.endsAt).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              ).
            </p>
            <p>
              Cerralo antes de crear uno nuevo.{' '}
              <Link
                href={`/orgs/${orgId}/periods`}
                className="underline underline-offset-2 font-medium"
                style={{ color: '#92400e' }}
              >
                Ir a períodos →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Form card */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: 'white',
          borderColor: 'var(--color-neutral-200)',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Dates row */}
          <div className="grid grid-cols-2 gap-4">
            {/* startsAt */}
            <div className="space-y-1.5">
              <Label htmlFor="period-starts-at">Fecha de inicio</Label>
              <Input
                id="period-starts-at"
                type="date"
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value);
                  setCode('');
                  // Suppress browser-native English validation tooltip
                  e.target.setCustomValidity('');
                }}
                onBlur={() => handleFieldBlur('startsAt')}
                // No browser required — all validation is custom (Spanish)
              />
              {fieldErrors.startsAt && (
                <p className="text-xs text-red-600">{fieldErrors.startsAt}</p>
              )}
            </div>

            {/* endsAt */}
            <div className="space-y-1.5">
              <Label htmlFor="period-ends-at">Fecha de fin</Label>
              <Input
                id="period-ends-at"
                type="date"
                value={endsAt}
                onChange={(e) => {
                  setEndsAt(e.target.value);
                  setCode('');
                  // Suppress browser-native English validation tooltip
                  e.target.setCustomValidity('');
                }}
                onBlur={() => handleFieldBlur('endsAt')}
              />
              {fieldErrors.endsAt && (
                <p className="text-xs text-red-600">{fieldErrors.endsAt}</p>
              )}
            </div>
          </div>

          {/* Period code */}
          <div className="space-y-1.5">
            <Label htmlFor="period-code">Nombre del período</Label>
            <Input
              id="period-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={handleCodeBlur}
              placeholder="Ej: Q2 2026 o Segundo trimestre 2026"
              maxLength={50}
            />
            <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
              Se completará automáticamente si dejás el campo vacío al salir.
            </p>
            {fieldErrors.code && (
              <p className="text-xs text-red-600">{fieldErrors.code}</p>
            )}
          </div>

          {/* Server error */}
          {serverError && (
            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
            >
              <p className="text-sm" style={{ color: '#b91c1c' }}>{serverError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/orgs/${orgId}/periods`)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || hasOpenPeriod}>
              {loading ? 'Creando...' : 'Crear período'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
