import { describe, it, expect } from 'vitest';
import { cleanText, safeText, safeTextOrNull, scrubDeep } from './text.presenter.js';

describe('saneamiento de texto para el modelo', () => {
  it('quita caracteres de control y de ancho cero pero conserva saltos de línea y tabulaciones', () => {
    expect(cleanText('a\u0000b\u0007c​d‮e\nf\tg')).toBe('abcde\nf\tg');
  });

  it('neutraliza la sintaxis de imagen Markdown', () => {
    expect(cleanText('mirá ![x](https://evil.example/?d=1)')).toBe('mirá ! [x](https://evil.example/?d=1)');
    expect(cleanText('![![')).not.toContain('![');
  });

  it('recorta con elipsis y respeta el máximo', () => {
    const out = safeText('x'.repeat(600), 500);
    expect(out).toHaveLength(500);
    expect(out.endsWith('…')).toBe(true);
    expect(safeText('  hola  ', 10)).toBe('hola');
  });

  it('safeTextOrNull devuelve null para null, undefined y texto vacío', () => {
    expect(safeTextOrNull(null, 10)).toBeNull();
    expect(safeTextOrNull(undefined, 10)).toBeNull();
    expect(safeTextOrNull('  \u0000 ', 10)).toBeNull();
  });

  it('scrubDeep sanea todas las cadenas de un JSON anidado sin tocar números ni booleanos', () => {
    const out = scrubDeep({ a: ['![x]', { b: 'ok\u0001' }], n: 1, t: true, z: null });
    expect(out).toEqual({ a: ['! [x]', { b: 'ok' }], n: 1, t: true, z: null });
  });
});
