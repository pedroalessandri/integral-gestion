import type { OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';
import type { ApiErrorInfo } from '@/lib/api-errors';
import { describeApiError } from '@/features/planning/error-messages';
import { INVITE_SCOPE_LABELS, ORG_UNIT_KIND_LABELS, SCOPE_WHOLE_ORG_LABEL } from '@/lib/labels';
import { flattenTree } from './tree';

/** Valor del <select> sin elección (el usuario tiene que elegir). */
export const INVITE_SCOPE_UNSET = '';
/** Valor del <select> para la elección explícita "Toda la organización" (se envía como null). */
export const INVITE_SCOPE_WHOLE_ORG = '__whole_org__';

export interface InviteScopeOption {
  value: string;
  label: string;
}

/** Opciones: "Toda la organización" + unidades del árbol indentadas por nivel (la central equivale a toda la org). */
export function buildInviteScopeOptions(tree: OrgUnitTreeNodeDto[]): InviteScopeOption[] {
  const units = flattenTree(tree)
    .filter((u) => u.node.kind !== 'central')
    .map((u) => ({
      value: u.node.id,
      label: `${'— '.repeat(Math.max(0, u.depth - 2))}${u.node.name} (${ORG_UNIT_KIND_LABELS[u.node.kind]})`,
    }));
  return [{ value: INVITE_SCOPE_WHOLE_ORG, label: SCOPE_WHOLE_ORG_LABEL }, ...units];
}

/**
 * Traduce el valor del selector al `orgUnitId` del contrato: string (unidad), null (toda la org)
 * o `undefined` si todavía no se eligió nada (no se puede enviar).
 */
export function resolveInviteOrgUnitId(value: string): string | null | undefined {
  if (value === INVITE_SCOPE_UNSET) return undefined;
  if (value === INVITE_SCOPE_WHOLE_ORG) return null;
  return value;
}

/** Mensaje de validación previa al envío, o null si se puede enviar. */
export function validateInviteScope(value: string): string | null {
  return resolveInviteOrgUnitId(value) === undefined ? INVITE_SCOPE_LABELS.required : null;
}

/** Mensaje en español para el error de la invitación (403 OrgUnitScopeForbidden, 400 por orgUnitId faltante, resto genérico). */
export function describeInviteError(info: ApiErrorInfo): string {
  if (info.code === 'OrgUnitScopeForbidden') return INVITE_SCOPE_LABELS.forbidden;
  if (info.status === 400 && /orgUnitId/i.test(info.message)) return INVITE_SCOPE_LABELS.missing;
  return describeApiError(info);
}
