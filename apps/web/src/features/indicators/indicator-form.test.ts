import { describe, expect, it } from 'vitest';
import {
  emptyIndicatorForm,
  inferDirection,
  scaleDecimal,
  toCreateIndicatorDto,
  toMetricAttributesPatch,
  toUpdateIndicatorDto,
  validateBaselineTarget,
  validateIndicatorForm,
} from './indicator-form';

describe('scaleDecimal', () => {
  it('escala a 4 decimales sin floats', () => {
    expect(scaleDecimal('12.5')).toBe(BigInt(125000));
    expect(scaleDecimal('-0.0001')).toBe(BigInt(-1));
    expect(scaleDecimal('0')).toBe(BigInt(0));
  });
  it('rechaza lo que no es decimal válido', () => {
    expect(scaleDecimal('12,5')).toBeNull();
    expect(scaleDecimal('1.23456')).toBeNull();
    expect(scaleDecimal('')).toBeNull();
  });
});

describe('validateBaselineTarget', () => {
  it('acepta creciente con meta mayor y decreciente con meta menor', () => {
    expect(validateBaselineTarget('0', '500', 'increasing')).toBeNull();
    expect(validateBaselineTarget('40', '10.5', 'decreasing')).toBeNull();
  });
  it('rechaza base igual a meta y dirección contraria a la meta', () => {
    expect(validateBaselineTarget('5', '5', 'increasing')).toMatch(/no pueden ser iguales/);
    expect(validateBaselineTarget('50', '10', 'increasing')).toMatch(/creciente/);
    expect(validateBaselineTarget('10', '50', 'decreasing')).toMatch(/decreciente/);
  });
  it('rechaza valores no numéricos', () => {
    expect(validateBaselineTarget('abc', '5', 'increasing')).toMatch(/línea base/);
    expect(validateBaselineTarget('0', '', 'increasing')).toMatch(/meta/);
  });
});

describe('inferDirection', () => {
  it('infiere según el signo de meta - base', () => {
    expect(inferDirection('0', '10')).toBe('increasing');
    expect(inferDirection('10', '0')).toBe('decreasing');
    expect(inferDirection('3', '3')).toBeNull();
    expect(inferDirection('x', '3')).toBeNull();
  });
});

const period = { startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-12-31T00:00:00.000Z' };

describe('validateIndicatorForm', () => {
  it('exige nombre con métrica nueva y métrica elegida con existente', () => {
    const base = { ...emptyIndicatorForm(), targetValue: '10' };
    expect(validateIndicatorForm(base, false, period)).toMatch(/nombre/);
    expect(validateIndicatorForm({ ...base, sourceMode: 'existing' }, false, period)).toMatch(/Elegí una métrica/);
    expect(validateIndicatorForm({ ...base, name: 'Km' }, false, period)).toBeNull();
  });
  it('en curva manual valida los valores de los intervalos', () => {
    const manual = { ...emptyIndicatorForm(), name: 'Km', targetValue: '10', frequency: 'quarterly' as const, curveMode: 'manual' as const };
    expect(validateIndicatorForm({ ...manual, pointValues: { '2027-04-01': '3,5' } }, false, period)).toMatch(/01\/04\/2027/);
    expect(validateIndicatorForm({ ...manual, pointValues: { '2027-04-01': '3.5' } }, false, period)).toBeNull();
    expect(validateIndicatorForm({ ...manual, frequency: 'monthly', pointValues: {} }, false, { startsAt: 'x', endsAt: 'y' })).toMatch(/intervalos/);
  });
});

describe('toCreateIndicatorDto', () => {
  const values = { ...emptyIndicatorForm(), name: ' Km de ciclovía ', source: ' Obras ', targetValue: '120' };
  it('arma la métrica inline en un solo paso, sin campos vacíos', () => {
    expect(toCreateIndicatorDto(values, false, period)).toEqual({
      metric: { name: 'Km de ciclovía', unit: 'number', frequency: 'monthly', kind: 'output', source: 'Obras' },
      baselineValue: '0',
      targetValue: '120',
      direction: 'increasing',
      expectedCurveMode: 'linear',
    });
  });
  it('con métrica existente manda solo metricId y los valores del indicador', () => {
    const dto = toCreateIndicatorDto({ ...values, sourceMode: 'existing', metricId: 'm-1' }, false, period);
    expect(dto.metricId).toBe('m-1');
    expect(dto.metric).toBeUndefined();
  });
  it('en curva manual manda los puntos con valor y el último intervalo igual a la meta', () => {
    const dto = toCreateIndicatorDto(
      {
        ...values,
        frequency: 'semiannual',
        curveMode: 'manual',
        pointValues: { '2027-01-01': ' 18 ', '2027-07-01': '99' },
      },
      false,
      period,
    );
    expect(dto.expectedCurveMode).toBe('manual');
    expect(dto.targetPoints).toEqual([
      { bucketDate: '2027-01-01', expectedValue: '18' },
      { bucketDate: '2027-07-01', expectedValue: '120' },
    ]);
  });
  it('en un grupo ponderado el nuevo entra con peso 0', () => {
    expect(toCreateIndicatorDto(values, true, period).weightBp).toBe(0);
    expect(toCreateIndicatorDto(values, false, period)).not.toHaveProperty('weightBp');
  });
});

describe('toUpdateIndicatorDto / toMetricAttributesPatch', () => {
  const values = { ...emptyIndicatorForm(), kind: 'outcome' as const, source: '', description: 'Fórmula', targetValue: '9' };
  it('el update del indicador lleva base, meta, dirección y modo de curva', () => {
    expect(toUpdateIndicatorDto(values, period)).toEqual({
      baselineValue: '0',
      targetValue: '9',
      direction: 'increasing',
      expectedCurveMode: 'linear',
    });
  });
  it('pasar a lineal no manda puntos', () => {
    expect(toUpdateIndicatorDto({ ...values, pointValues: { '2027-01-01': '1' } }, period)).not.toHaveProperty(
      'targetPoints',
    );
  });
  it('el patch de la métrica solo incluye lo que cambió', () => {
    expect(toMetricAttributesPatch(values, { kind: 'output', source: null, description: 'Fórmula' })).toEqual({
      kind: 'outcome',
    });
    expect(toMetricAttributesPatch(values, { kind: 'outcome', source: 'X', description: 'Fórmula' })).toEqual({
      source: null,
    });
    expect(toMetricAttributesPatch(values, { kind: 'outcome', source: null, description: 'Fórmula' })).toBeNull();
  });
});
