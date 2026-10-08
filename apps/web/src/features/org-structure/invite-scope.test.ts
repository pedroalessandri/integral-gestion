import { describe, expect, it } from 'vitest';
import type { OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';
import {
  INVITE_SCOPE_UNSET,
  INVITE_SCOPE_WHOLE_ORG,
  buildInviteScopeOptions,
  describeInviteError,
  resolveInviteOrgUnitId,
  validateInviteScope,
} from './invite-scope';
import { INVITE_SCOPE_LABELS, SCOPE_WHOLE_ORG_LABEL } from '@/lib/labels';

const node = (id: string, kind: OrgUnitTreeNodeDto['kind'], children: OrgUnitTreeNodeDto[] = []) =>
  ({ id, name: id, kind, children }) as unknown as OrgUnitTreeNodeDto;

const tree = [node('c', 'central', [node('m', 'ministry', [node('a', 'area')])])];

describe('invite-scope', () => {
  it('arma opciones con toda la organización primero y unidades indentadas', () => {
    const opts = buildInviteScopeOptions(tree);
    expect(opts.map((o) => o.value)).toEqual([INVITE_SCOPE_WHOLE_ORG, 'm', 'a']);
    expect(opts[0]?.label).toBe(SCOPE_WHOLE_ORG_LABEL);
    expect(opts[1]?.label.startsWith('m')).toBe(true);
    expect(opts[2]?.label.startsWith('— a')).toBe(true);
  });

  it('resuelve el valor del selector a orgUnitId', () => {
    expect(resolveInviteOrgUnitId(INVITE_SCOPE_UNSET)).toBeUndefined();
    expect(resolveInviteOrgUnitId(INVITE_SCOPE_WHOLE_ORG)).toBeNull();
    expect(resolveInviteOrgUnitId('m')).toBe('m');
  });

  it('valida que haya elección', () => {
    expect(validateInviteScope('')).toBe(INVITE_SCOPE_LABELS.required);
    expect(validateInviteScope(INVITE_SCOPE_WHOLE_ORG)).toBeNull();
    expect(validateInviteScope('m')).toBeNull();
  });

  it('describe los errores de la invitación', () => {
    expect(describeInviteError({ status: 403, code: 'OrgUnitScopeForbidden', message: 'x' })).toBe(
      INVITE_SCOPE_LABELS.forbidden,
    );
    expect(describeInviteError({ status: 400, code: null, message: 'orgUnitId must be a string' })).toBe(
      INVITE_SCOPE_LABELS.missing,
    );
    expect(describeInviteError({ status: 403, code: null, message: '' })).toMatch(/permisos/);
  });
});
