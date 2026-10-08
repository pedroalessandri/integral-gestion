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

describe('validateIndicatorForm', () => {
  it('exige nombre con métrica nueva y métrica elegida con existente', () => {
    const base = { ...emptyIndicatorForm(), targetValue: '10' };
    expect(validateIndicatorForm(base, false)).toMatch(/nombre/);
    expect(validateIndicatorForm({ ...base, sourceMode: 'existing' }, false)).toMatch(/Elegí una métrica/);
    expect(validateIndicatorForm({ ...base, name: 'Km' }, false)).toBeNull();
  });
});

describe('toCreateIndicatorDto', () => {
  const values = { ...emptyIndicatorForm(), name: ' Km de ciclovía ', source: ' Obras ', targetValue: '120' };
  it('arma la métrica inline en un solo paso, sin campos vacíos', () => {
    expect(toCreateIndicatorDto(values, false)).toEqual({
      metric: { name: 'Km de ciclovía', unit: 'number', frequency: 'monthly', kind: 'output', source: 'Obras' },
      baselineValue: '0',
      targetValue: '120',
      direction: 'increasing',
    });
  });
  it('con métrica existente manda solo metricId y los valores del indicador', () => {
    const dto = toCreateIndicatorDto({ ...values, sourceMode: 'existing', metricId: 'm-1' }, false);
    expect(dto.metricId).toBe('m-1');
    expect(dto.metric).toBeUndefined();
  });
  it('en un grupo ponderado el nuevo entra con peso 0', () => {
    expect(toCreateIndicatorDto(values, true).weightBp).toBe(0);
    expect(toCreateIndicatorDto(values, false)).not.toHaveProperty('weightBp');
  });
});

describe('toUpdateIndicatorDto / toMetricAttributesPatch', () => {
  const values = { ...emptyIndicatorForm(), kind: 'outcome' as const, source: '', description: 'Fórmula', targetValue: '9' };
  it('el update del indicador lleva base, meta y dirección', () => {
    expect(toUpdateIndicatorDto(values)).toEqual({ baselineValue: '0', targetValue: '9', direction: 'increasing' });
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
