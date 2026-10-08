import { describe, expect, it } from 'vitest';
import {
  curveBuckets,
  formatBucketDate,
  isLockedBucket,
  pointsToValues,
  toEditableCurveMode,
  toTargetPointInputs,
  validateCurvePoints,
} from './curve-form';

const period = { startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-12-31T00:00:00.000Z' };

describe('curveBuckets', () => {
  it('un intervalo por bucket de la frecuencia dentro del período', () => {
    expect(curveBuckets(period, 'semiannual')).toEqual(['2027-01-01', '2027-07-01']);
    expect(curveBuckets(period, 'quarterly')).toEqual(['2027-01-01', '2027-04-01', '2027-07-01', '2027-10-01']);
    expect(curveBuckets(period, 'monthly')).toHaveLength(12);
    expect(curveBuckets(period, 'annual')).toEqual(['2027-01-01']);
  });
  it('con un período ilegible no hay intervalos', () => {
    expect(curveBuckets({ startsAt: '', endsAt: '' }, 'monthly')).toEqual([]);
  });
});

describe('validateCurvePoints', () => {
  const buckets = ['2027-01-01', '2027-04-01', '2027-07-01'];
  it('acepta puntos vacíos (se interpolan) y no monótonos', () => {
    expect(validateCurvePoints({}, buckets, '30')).toBeNull();
    expect(validateCurvePoints({ '2027-01-01': '50', '2027-04-01': '10' }, buckets, '30')).toBeNull();
  });
  it('rechaza valores que no son decimales de hasta 4 decimales', () => {
    expect(validateCurvePoints({ '2027-04-01': '1,5' }, buckets, '30')).toMatch(/01\/04\/2027/);
    expect(validateCurvePoints({ '2027-04-01': '1.23456' }, buckets, '30')).toMatch(/número/);
  });
  it('exige una meta válida y que haya intervalos', () => {
    expect(validateCurvePoints({}, buckets, '')).toMatch(/meta/);
    expect(validateCurvePoints({}, [], '30')).toMatch(/intervalos/);
  });
  it('ignora lo escrito en el último intervalo: siempre vale la meta', () => {
    expect(validateCurvePoints({ '2027-07-01': 'abc' }, buckets, '30')).toBeNull();
  });
});

describe('toTargetPointInputs', () => {
  const buckets = ['2027-01-01', '2027-04-01', '2027-07-01'];
  it('manda los intervalos con valor, ordenados, y el último igual a la meta', () => {
    expect(toTargetPointInputs({ '2027-04-01': ' 12.5 ', '2027-07-01': '1' }, buckets, ' 30 ')).toEqual([
      { bucketDate: '2027-04-01', expectedValue: '12.5' },
      { bucketDate: '2027-07-01', expectedValue: '30' },
    ]);
  });
  it('solo con el último intervalo, manda un único punto con la meta', () => {
    expect(toTargetPointInputs({}, buckets, '30')).toEqual([{ bucketDate: '2027-07-01', expectedValue: '30' }]);
  });
});

describe('helpers', () => {
  it('isLockedBucket marca solo el último intervalo', () => {
    const buckets = ['2027-01-01', '2027-07-01'];
    expect(isLockedBucket(buckets, '2027-07-01')).toBe(true);
    expect(isLockedBucket(buckets, '2027-01-01')).toBe(false);
    expect(isLockedBucket([], '2027-01-01')).toBe(false);
  });
  it('pointsToValues y formatBucketDate', () => {
    expect(pointsToValues([{ bucketDate: '2027-01-01', expectedValue: '18' }])).toEqual({ '2027-01-01': '18' });
    expect(formatBucketDate('2027-07-01')).toBe('01/07/2027');
  });
  it('from_projects se edita como lineal hasta que esté disponible', () => {
    expect(toEditableCurveMode('from_projects')).toBe('linear');
    expect(toEditableCurveMode('manual')).toBe('manual');
  });
});
