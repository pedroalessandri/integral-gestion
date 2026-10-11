import { describe, expect, it } from 'vitest';
import { SECTOR_ERROR_CODES, getSectorLabels } from '@/lib/labels';
import { describeApiError } from './error-messages';
import { resolveSectorError } from './sector-errors';

describe('resolveSectorError', () => {
  const neutral = describeApiError({ status: 422, code: 'StrategicPlanNotFound', message: 'x' });

  it('usa el texto del sector cuando hay uno para el código', () => {
    const publico = getSectorLabels('public').errors;
    const privado = getSectorLabels('private').errors;
    const ong = getSectorLabels('nonprofit').errors;
    expect(resolveSectorError(publico, 'StrategicPlanNotFound', neutral)).toBe(
      'La organización todavía no tiene un plan de gobierno.',
    );
    expect(resolveSectorError(privado, 'StrategicPlanNotFound', neutral)).toBe(
      'La organización todavía no tiene un plan estratégico.',
    );
    expect(resolveSectorError(ong, 'OrgUnitKindInvalid', neutral)).toContain('Dirección Ejecutiva');
  });

  it('deja el texto de la acción si el código no es de sector o no hay código', () => {
    const privado = getSectorLabels('private').errors;
    expect(resolveSectorError(privado, 'OrgUnitHasChildren', 'texto')).toBe('texto');
    expect(resolveSectorError(privado, null, 'texto')).toBe('texto');
  });

  it('los códigos de sector tienen un texto neutro de respaldo distinto del genérico', () => {
    for (const code of SECTOR_ERROR_CODES) {
      const msg = describeApiError({ status: 422, code, message: 'x' });
      expect(msg).not.toBe('x');
      expect(msg.length).toBeGreaterThan(10);
    }
  });
});
