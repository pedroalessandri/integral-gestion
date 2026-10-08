import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PendingLoadBadge } from './pending-load-badge';
import { SemaphoreBadge } from './semaphore-badge';

describe('SemaphoreBadge', () => {
  it('muestra la etiqueta y el desvío en puntos, no solo el color', () => {
    const html = renderToStaticMarkup(
      <SemaphoreBadge color="yellow" deviationBp={-2000} reading="Avance de resultado" />,
    );
    expect(html).toContain('Atención');
    expect(html).toContain('-20,0 pts');
    expect(html).toContain('Avance de resultado');
  });
  it('sin datos no inventa un color ni un desvío', () => {
    const html = renderToStaticMarkup(<SemaphoreBadge color={null} deviationBp={null} reading="x" />);
    expect(html).toContain('Sin datos');
    expect(html).not.toContain('pts');
  });
  it('cada color tiene su texto', () => {
    expect(renderToStaticMarkup(<SemaphoreBadge color="green" deviationBp={500} reading="x" />)).toContain('En tiempo');
    expect(renderToStaticMarkup(<SemaphoreBadge color="red" deviationBp={-3000} reading="x" />)).toContain('Atrasado');
  });
});

describe('PendingLoadBadge', () => {
  it('no se muestra sin buckets vencidos', () => {
    expect(renderToStaticMarkup(<PendingLoadBadge count={0} />)).toBe('');
  });
  it('singular y plural', () => {
    expect(renderToStaticMarkup(<PendingLoadBadge count={1} />)).toContain('Carga pendiente');
    expect(renderToStaticMarkup(<PendingLoadBadge count={3} />)).toContain('3 cargas pendientes');
  });
});
