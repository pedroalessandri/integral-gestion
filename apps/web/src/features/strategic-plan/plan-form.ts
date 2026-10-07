import type { AxisDto, CreateAxisDto, StrategicPlanDto, UpdateAxisDto, UpsertStrategicPlanDto } from '@gestion-publica/shared-types/planning';

export interface PlanFormValues {
  title: string;
  vision: string;
  /** YYYY-MM-DD (input type=date). */
  mandateStartsAt: string;
  mandateEndsAt: string;
}

export interface AxisFormValues {
  name: string;
  description: string;
  /** Vacío = que el backend asigne el orden por defecto. */
  order: string;
}

/** ISO-8601 UTC -> YYYY-MM-DD para el input date. */
export const isoToDateInput = (iso: string): string => iso.slice(0, 10);

/** YYYY-MM-DD -> ISO-8601 UTC a medianoche. */
export const dateInputToIso = (date: string): string => `${date}T00:00:00.000Z`;

export function planToFormValues(plan: StrategicPlanDto | null): PlanFormValues {
  return {
    title: plan?.title ?? '',
    vision: plan?.vision ?? '',
    mandateStartsAt: plan ? isoToDateInput(plan.mandateStartsAt) : '',
    mandateEndsAt: plan ? isoToDateInput(plan.mandateEndsAt) : '',
  };
}

/** Chequeo previo de UX; la regla vive en el backend (422 `MandateRangeInvalid`). */
export function isMandateRangeValid(values: PlanFormValues): boolean {
  return values.mandateStartsAt !== '' && values.mandateEndsAt !== '' && values.mandateEndsAt > values.mandateStartsAt;
}

export function toUpsertPlanDto(values: PlanFormValues): UpsertStrategicPlanDto {
  return {
    title: values.title.trim(),
    vision: values.vision.trim(),
    mandateStartsAt: dateInputToIso(values.mandateStartsAt),
    mandateEndsAt: dateInputToIso(values.mandateEndsAt),
  };
}

export function axisToFormValues(axis: AxisDto | null): AxisFormValues {
  return {
    name: axis?.name ?? '',
    description: axis?.description ?? '',
    order: axis ? String(axis.order) : '',
  };
}

const parseOrder = (order: string): number | undefined => {
  if (order.trim() === '') return undefined;
  const n = Number(order);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

export function toCreateAxisDto(values: AxisFormValues): CreateAxisDto {
  const order = parseOrder(values.order);
  return {
    name: values.name.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    ...(order !== undefined && { order }),
  };
}

export function toUpdateAxisDto(axis: AxisDto, values: AxisFormValues): UpdateAxisDto {
  const dto: UpdateAxisDto = {};
  const description = values.description.trim() === '' ? null : values.description.trim();
  const order = parseOrder(values.order);
  if (values.name.trim() !== axis.name) dto.name = values.name.trim();
  if (description !== axis.description) dto.description = description;
  if (order !== undefined && order !== axis.order) dto.order = order;
  return dto;
}
