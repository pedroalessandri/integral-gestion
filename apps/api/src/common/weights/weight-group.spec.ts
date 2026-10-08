import { describe, it, expect } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { assertSameSiblingSet, assertValidWeightGroup } from './weight-group.js';

describe('assertValidWeightGroup (RN-P6)', () => {
  it('acepta grupo vacío, sin pesos y ponderado que suma 10000', () => {
    expect(() => assertValidWeightGroup([], 'tareas')).not.toThrow();
    expect(() => assertValidWeightGroup([{ weightBp: null }, { weightBp: null }], 'tareas')).not.toThrow();
    expect(() => assertValidWeightGroup([{ weightBp: 4000 }, { weightBp: 6000 }], 'tareas')).not.toThrow();
  });

  it('grupo mixto -> 422 MixedWeightGroup', () => {
    expect(() => assertValidWeightGroup([{ weightBp: 10000 }, { weightBp: null }], 'tareas')).toThrow(/MixedWeightGroup/);
    expect(() => assertValidWeightGroup([{ weightBp: 10000 }, { weightBp: null }], 'tareas')).toThrow(UnprocessableEntityException);
  });

  it('suma distinta de 10000 -> 422 WeightSumInvalid', () => {
    expect(() => assertValidWeightGroup([{ weightBp: 4000 }, { weightBp: 5000 }], 'proyectos')).toThrow(/WeightSumInvalid/);
    expect(() => assertValidWeightGroup([{ weightBp: 6000 }, { weightBp: 6000 }], 'proyectos')).toThrow(UnprocessableEntityException);
  });
});

describe('assertSameSiblingSet', () => {
  it('exige exactamente el set de hermanos vivos', () => {
    expect(() => assertSameSiblingSet(['a', 'b'], ['b', 'a'])).not.toThrow();
    expect(() => assertSameSiblingSet(['a', 'b'], ['a'])).toThrow(/WeightsSetMismatch/);
    expect(() => assertSameSiblingSet(['a', 'b'], ['a', 'a'])).toThrow(/WeightsSetMismatch/);
    expect(() => assertSameSiblingSet(['a'], ['a', 'z'])).toThrow(/WeightsSetMismatch/);
  });
});
