import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  FORBIDDEN_PUBLIC_SECTOR_TERMS,
  ORGANIZATION_SECTORS,
  SECTOR_TERMS,
} from '@gestion-publica/shared-types/core';

/**
 * ADR-0011 D7 (lado API): el vocabulario del sector público no puede aparecer fuera del diccionario
 * público. Escanea los prompts del copiloto, el módulo `mcp` (cuando exista) y los seeds de Lumbre (C31) y Semillero (C32),
 * sin excepciones de archivo, y verifica que los términos de los sectores privado y sin fines de lucro
 * estén limpios.
 */

const SRC = join(__dirname, '..', '..');

function listTsFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(spec|test)\./.test(name) ? [full] : [];
  });
}

/** Quita comentarios con una regex simple (mismo criterio que el guard de la web). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe('ADR-0011 D7 — términos de gobierno fuera del sector público (API)', () => {
  const scanned = [
    join(SRC, 'modules', 'ai', 'prompts'),
    join(SRC, 'modules', 'mcp'),
    join(SRC, 'database', 'seed-demo-lumbre.ts'),
    join(SRC, 'database', 'seed-demo-semillero.ts'),
  ].flatMap(listTsFiles);

  it('escanea al menos los prompts del copiloto', () => {
    expect(scanned.length).toBeGreaterThan(0);
  });

  it('no hay vocabulario de gobierno en prompts, mcp ni seeds de Lumbre y Semillero', () => {
    const hits: string[] = [];
    for (const file of scanned) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        for (const term of FORBIDDEN_PUBLIC_SECTOR_TERMS) {
          if (term.test(line)) {
            hits.push(`${relative(SRC, file)}:${i + 1} (${term.source}) -> movelo al diccionario de sector`);
          }
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it('SECTOR_TERMS tiene una entrada por cada sector', () => {
    expect(Object.keys(SECTOR_TERMS).sort()).toEqual([...ORGANIZATION_SECTORS].sort());
  });

  it.each(['private', 'nonprofit'] as const)('SECTOR_TERMS.%s no tiene términos de gobierno', (sector) => {
    for (const text of collectStrings(SECTOR_TERMS[sector])) {
      for (const term of FORBIDDEN_PUBLIC_SECTOR_TERMS) {
        expect(text, `"${text}" contiene ${term.source}`).not.toMatch(term);
      }
    }
  });
});
