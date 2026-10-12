import { describe, it, expect } from 'vitest';
import { presentExecutionReading, presentResultReading, semaforoEs } from './progress.presenter.js';
import { presentAggregate } from './aggregate.presenter.js';
import { terminologiaDeSector } from './terminology.presenter.js';

/** Claves que combinarían o esconderían las dos lecturas de avance. */
const FORBIDDEN = ['avance', 'progreso', 'progress', 'progressBp', 'avanceTotal', 'avanceCombinado'];
function keys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keys(v, out);
    }
  }
  return out;
}

describe('presentadores de avance', () => {
  it('resultado: bp entero + texto decimal exacto, desvío con signo y semáforo en español', () => {
    expect(
      presentResultReading({ progressBp: 4530, deviationBp: -320, semaphore: 'yellow', pendingBucketsCount: 2 }),
    ).toEqual({
      bp: 4530,
      porcentaje: '45.30',
      desvioBp: -320,
      desvioPuntos: '-3.20',
      semaforo: 'amarillo',
      cargasPendientes: 2,
    });
  });

  it('resultado sin cargas: desvío y semáforo null con motivo', () => {
    const out = presentResultReading({ progressBp: 0, deviationBp: null, semaphore: null, pendingBucketsCount: 0 });
    expect(out.desvioPuntos).toBeNull();
    expect(out.semaforo).toBeNull();
    expect(out.motivo).toBe('sin cargas');
  });

  it('gestión: incluye el planificado en bp y en texto', () => {
    const out = presentExecutionReading({ progressBp: 6000, plannedBp: 6200, deviationBp: -200, semaphore: 'green' });
    expect(out).toMatchObject({
      bp: 6000,
      porcentaje: '60.00',
      planificadoBp: 6200,
      planificadoPorcentaje: '62.00',
      desvioPuntos: '-2.00',
      semaforo: 'verde',
    });
  });

  it('semaforoEs mapea los tres colores', () => {
    expect([semaforoEs('green'), semaforoEs('yellow'), semaforoEs('red'), semaforoEs(null)]).toEqual([
      'verde',
      'amarillo',
      'rojo',
      null,
    ]);
  });

  it('un agregado vacío explica el null con "sin objetivos"', () => {
    const out = presentAggregate({
      objectivesCount: 0,
      result: { progressBp: null, deviationBp: null, semaphore: null, pendingBucketsCount: 0 },
      execution: { progressBp: null, deviationBp: null, semaphore: null },
    });
    expect(out.avanceResultado.bp).toBeNull();
    expect(out.avanceResultado.motivo).toBe('sin objetivos');
    expect(out.avanceGestion.motivo).toBe('sin objetivos');
  });

  it('nunca emite un campo de avance combinado o sin calificar', () => {
    const out = presentAggregate({
      objectivesCount: 3,
      result: { progressBp: 4000, deviationBp: -100, semaphore: 'green', pendingBucketsCount: 1 },
      execution: { progressBp: 2500, deviationBp: -3000, semaphore: 'yellow' },
    });
    const all = keys(out);
    for (const forbidden of FORBIDDEN) expect(all).not.toContain(forbidden);
    expect(all).toEqual(expect.arrayContaining(['avanceResultado', 'avanceGestion']));
  });
});

describe('terminología por sector', () => {
  it('sale de SECTOR_TERMS y cae a público ante un valor desconocido', () => {
    expect(terminologiaDeSector('private').plan).toBe('Plan estratégico');
    expect(terminologiaDeSector('nonprofit').tiposUnidad.area).toBe('Programa');
    expect(terminologiaDeSector('lo-que-sea').sector).toBe('public');
  });
});
