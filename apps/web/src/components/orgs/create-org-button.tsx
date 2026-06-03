'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createOrgAction } from './actions';

// ---------------------------------------------------------------------------
// Helpers (local to this form — not shared)
// ---------------------------------------------------------------------------

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
function todayAsDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns a date N days after today as "YYYY-MM-DD". */
function dateStringPlusDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a "YYYY-MM-DD" string as "D MMM YYYY" in es-AR locale.
 * e.g. "2026-01-01" → "1 ene 2026"
 */
function formatDateEsAR(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Converts a "YYYY-MM-DD" string to ISO-8601 UTC midnight.
 * e.g. "2026-01-01" → "2026-01-01T00:00:00.000Z"
 */
function toUtcMidnight(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

/** Returns the number of days between start and end date strings (end - start). */
function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  slug?: string;
  name?: string;
  startsAt?: string;
  endsAt?: string;
  periodCode?: string;
}

function validateForm(values: {
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  periodCode: string;
}): FormErrors {
  const errors: FormErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Ingresá el nombre de la organización';
  }

  if (!values.slug.trim()) {
    errors.slug = 'Ingresá un slug para la organización';
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

  if (!values.periodCode.trim()) {
    errors.periodCode = 'Ingresá un nombre para el período';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateOrgButton() {
  const router = useRouter();
  const today = todayAsDateString();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Form fields
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState(dateStringPlusDays(today, 90));
  const [periodCode, setPeriodCode] = useState('');

  // Inline validation errors (shown after blur or submit attempt)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  function resetForm() {
    const newToday = todayAsDateString();
    setSlug('');
    setName('');
    setStartsAt(newToday);
    setEndsAt(dateStringPlusDays(newToday, 90));
    setPeriodCode('');
    setFieldErrors({});
    setSubmitAttempted(false);
    setServerError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  /**
   * Auto-suggest periodCode when the user blurs the field while it's empty
   * and both dates are valid.
   */
  function handlePeriodCodeBlur() {
    if (periodCode.trim()) return;

    if (
      startsAt &&
      endsAt &&
      endsAt > startsAt &&
      daysBetween(startsAt, endsAt) >= 7 &&
      daysBetween(startsAt, endsAt) <= 366
    ) {
      const suggested = `Período inicial ${formatDateEsAR(startsAt)} - ${formatDateEsAR(endsAt)}`;
      setPeriodCode(suggested);
      // Clear the required error if it was shown
      if (submitAttempted) {
        setFieldErrors((prev) => ({ ...prev, periodCode: undefined }));
      }
    } else if (submitAttempted) {
      setFieldErrors((prev) => ({ ...prev, periodCode: 'Ingresá un nombre para el período' }));
    }
  }

  function handleFieldBlur(field: keyof FormErrors) {
    if (!submitAttempted) return;
    const errors = validateForm({ slug, name, startsAt, endsAt, periodCode });
    setFieldErrors((prev) => ({ ...prev, [field]: errors[field] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setServerError(null);

    const errors = validateForm({ slug, name, startsAt, endsAt, periodCode });
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    const result = await createOrgAction({
      slug,
      name,
      firstPeriod: {
        code: periodCode.trim(),
        startsAt: toUtcMidnight(startsAt),
        endsAt: toUtcMidnight(endsAt),
      },
    });

    setLoading(false);

    if (result.error) {
      setServerError(result.error);
      return;
    }

    setOpen(false);
    resetForm();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>+ Nueva organización</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear organización</DialogTitle>
          <DialogDescription>
            Se creará la organización junto con su primer período. Podés ajustar las fechas y el
            nombre del período antes de confirmar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Nombre */}
          <div className="space-y-1">
            <Label htmlFor="org-name">Nombre</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleFieldBlur('name')}
              placeholder="Ej: Ministerio de Salud"
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          {/* Slug */}
          <div className="space-y-1">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              onBlur={() => handleFieldBlur('slug')}
              placeholder="ej-ministerio-salud"
            />
            <p className="text-xs text-muted-foreground">Solo minúsculas, números y guiones.</p>
            {fieldErrors.slug && (
              <p className="text-xs text-red-600">{fieldErrors.slug}</p>
            )}
          </div>

          <hr className="border-border" />

          {/* Primer período — dates */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Primer período</p>

            <div className="grid grid-cols-2 gap-3">
              {/* startsAt */}
              <div className="space-y-1">
                <Label htmlFor="period-starts-at">Fecha de inicio</Label>
                <Input
                  id="period-starts-at"
                  type="date"
                  value={startsAt}
                  onChange={(e) => {
                    setStartsAt(e.target.value);
                    // Clear auto-suggest when dates change so user can re-trigger
                    setPeriodCode('');
                  }}
                  onBlur={() => handleFieldBlur('startsAt')}
                />
                {fieldErrors.startsAt && (
                  <p className="text-xs text-red-600">{fieldErrors.startsAt}</p>
                )}
              </div>

              {/* endsAt */}
              <div className="space-y-1">
                <Label htmlFor="period-ends-at">Fecha de fin</Label>
                <Input
                  id="period-ends-at"
                  type="date"
                  value={endsAt}
                  onChange={(e) => {
                    setEndsAt(e.target.value);
                    // Clear auto-suggest when dates change so user can re-trigger
                    setPeriodCode('');
                  }}
                  onBlur={() => handleFieldBlur('endsAt')}
                />
                {fieldErrors.endsAt && (
                  <p className="text-xs text-red-600">{fieldErrors.endsAt}</p>
                )}
              </div>
            </div>

            {/* periodCode */}
            <div className="space-y-1">
              <Label htmlFor="period-code">Nombre del período</Label>
              <Input
                id="period-code"
                value={periodCode}
                onChange={(e) => setPeriodCode(e.target.value)}
                onBlur={handlePeriodCodeBlur}
                placeholder="Ej: Q1 2026 o Primer semestre 2026"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                Se completará automáticamente si dejás el campo vacío al salir.
              </p>
              {fieldErrors.periodCode && (
                <p className="text-xs text-red-600">{fieldErrors.periodCode}</p>
              )}
            </div>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-700 text-sm">{serverError}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear organización'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
