import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AutomaticEntryBadge } from './automatic-entry-badge';
import { ContributionShortfallAlert } from './contribution-shortfall-alert';

describe('AutomaticEntryBadge', () => {
  it('muestra "Automática" como texto y el proyecto de origen', () => {
    const html = renderToStaticMarkup(
      <AutomaticEntryBadge info={{ projectTitle: 'Ciclovía Av. Y', isCompensation: false }} />,
    );
    expect(html).toContain('Automática');
    expect(html).toContain('Ciclovía Av. Y');
    expect(html).not.toContain('Compensación');
  });
  it('marca la compensatoria y cae al texto genérico sin título', () => {
    const html = renderToStaticMarkup(<AutomaticEntryBadge info={{ projectTitle: null, isCompensation: true }} />);
    expect(html).toContain('Compensación');
    expect(html).toContain('Aporte de un proyecto');
  });
});

describe('ContributionShortfallAlert', () => {
  it('muestra total, valor proyectado y meta', () => {
    const html = renderToStaticMarkup(
      <ContributionShortfallAlert
        shortfall={{ count: 2, total: '4', projectedValue: '4' }}
        targetValue="10"
        unit="number"
      />,
    );
    expect(html).toContain('Los aportes no alcanzan la meta');
    expect(html).toContain('Total de aportes');
    expect(html).toContain('10');
  });
  it('sin aportes explica que ningún proyecto aporta', () => {
    const html = renderToStaticMarkup(
      <ContributionShortfallAlert shortfall={{ count: 0, total: '0', projectedValue: '0' }} targetValue="10" unit="number" />,
    );
    expect(html).toContain('ningún proyecto aporta');
  });
});
