import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PUBLIC_SECTOR_TERMS, ORGANIZATION_SECTORS, SECTOR_TERMS } from '@gestion-publica/shared-types/core';
import { getLabelsForSector, getSectorLabels } from '.';

/**
 * Guard de ADR-0011 D7: el vocabulario del sector público solo puede vivir en `lib/labels/sector/public.ts`.
 * Es un escaneo por regex: no detecta un término armado por concatenación, y un falso positivo se resuelve
 * reescribiendo el texto.
 */
const SRC_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ALLOWED_FILE = ['lib', 'labels', 'sector', 'public.ts'].join('/');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Quita comentarios conservando los saltos de línea, para que los números de línea sigan siendo los del archivo. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, '');
}

function isScanned(file: string): boolean {
  const rel = relative(SRC_ROOT, file).split(sep).join('/');
  if (/\.test\.(ts|tsx)$/.test(rel)) return false;
  if (rel === ALLOWED_FILE) return false;
  if (rel.startsWith('components/ui/')) return false;
  return true;
}

/** Todos los textos de un diccionario; invoca las funciones con argumentos de ejemplo. */
function collectStrings(value: unknown, path = ''): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }];
  if (typeof value === 'function') {
    const out = (value as (...args: unknown[]) => unknown)('ejemplo', 'ejemplo', 'ejemplo');
    return collectStrings(out, `${path}()`);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => collectStrings(child, path ? `${path}.${key}` : key));
  }
  return [];
}

function collectKeyPaths(value: unknown, path = ''): string[] {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => collectKeyPaths(child, path ? `${path}.${key}` : key));
  }
  return [path];
}

describe('textos de un sector fuera de su diccionario (ADR-0011 D7)', () => {
  it('apps/web/src no tiene vocabulario del sector público fuera de sector/public.ts', () => {
    const hits: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT).filter(isScanned)) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        for (const term of FORBIDDEN_PUBLIC_SECTOR_TERMS) {
          if (term.test(line)) {
            hits.push(
              `${relative(SRC_ROOT, file)}:${i + 1} contiene ${term}. Movelo al diccionario de sector (lib/labels/sector/*).`,
            );
          }
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it.each(['private', 'nonprofit'] as const)('el diccionario %s no usa vocabulario del sector público', (sector) => {
    const texts = [
      ...collectStrings(getLabelsForSector(sector)),
      ...collectStrings(SECTOR_TERMS[sector], 'SECTOR_TERMS'),
    ];
    expect(texts.length).toBeGreaterThan(50);
    const hits = texts.flatMap(({ path, text }) =>
      FORBIDDEN_PUBLIC_SECTOR_TERMS.filter((term) => term.test(text)).map((term) => `${path}: "${text}" (${term})`),
    );
    expect(hits).toEqual([]);
  });

  it('los tres sectores tienen las mismas claves', () => {
    const [first, ...rest] = ORGANIZATION_SECTORS.map((s) => collectKeyPaths(getSectorLabels(s)).sort());
    for (const other of rest) expect(other).toEqual(first);
  });

  it('el sector público conserva el texto de San Carrillo', () => {
    const publico = getSectorLabels('public');
    expect(publico.plan.singular).toBe('Plan de gobierno');
    expect(publico.plan.vision).toBe('Visión general de gobierno');
    expect(publico.orgUnitKind).toEqual({
      central: 'Central',
      ministry: 'Ministerio / Secretaría',
      area: 'Área / Dirección',
    });
    expect(publico.planningTreeText.noPlan).toBe('Sin plan de gobierno activo');
  });

  it('los tipos de unidad de cada sector coinciden con ADR-0011', () => {
    expect(getSectorLabels('private').orgUnitKind).toEqual({
      central: 'Dirección General',
      ministry: 'Dirección',
      area: 'Área',
    });
    expect(getSectorLabels('nonprofit').orgUnitKind).toEqual({
      central: 'Dirección Ejecutiva',
      ministry: 'Área',
      area: 'Programa',
    });
  });
});
