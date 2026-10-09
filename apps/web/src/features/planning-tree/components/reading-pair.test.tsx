import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NodeReadings } from '../planning-tree-view';
import { ReadingPair } from './reading-pair';

const readings: NodeReadings = {
  result: { progressBp: 4000, deviationBp: -3000, semaphore: 'red', pendingBucketsCount: 2 },
  execution: { progressBp: 6000, deviationBp: 1000, semaphore: 'green' },
};

describe('ReadingPair', () => {
  it('muestra dos barras separadas, cada una con su semáforo en texto', () => {
    const html = renderToStaticMarkup(<ReadingPair readings={readings} testId="n" />);
    expect(html).toContain('data-testid="n-result"');
    expect(html).toContain('data-testid="n-execution"');
    expect(html).toContain('40.0%');
    expect(html).toContain('60.0%');
    expect(html).toContain('Atrasado');
    expect(html).toContain('En tiempo');
    expect(html).toContain('2 cargas pendientes');
  });

  it('sin objetivos muestra "Sin objetivos" en vez de 0 %', () => {
    const empty: NodeReadings = {
      result: { progressBp: null, deviationBp: null, semaphore: null, pendingBucketsCount: 0 },
      execution: { progressBp: null, deviationBp: null, semaphore: null },
    };
    const html = renderToStaticMarkup(<ReadingPair readings={empty} testId="n" />);
    expect(html).toContain('Sin objetivos');
    expect(html).not.toContain('0.0%');
  });
});
