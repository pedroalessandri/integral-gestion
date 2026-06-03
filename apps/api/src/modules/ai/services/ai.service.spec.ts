import { describe, it, expect } from 'vitest';
import { tryParseValidationJson } from './ai.service.js';

describe('tryParseValidationJson', () => {
  it('parses plain JSON', () => {
    const out = tryParseValidationJson('{"overallScore": 70, "verdict": "bueno"}');
    expect(out).toEqual({ overallScore: 70, verdict: 'bueno' });
  });

  it('parses JSON wrapped in ```json fences', () => {
    const text = '```json\n{"overallScore": 80, "verdict": "excelente"}\n```';
    const out = tryParseValidationJson(text);
    expect(out).toEqual({ overallScore: 80, verdict: 'excelente' });
  });

  it('parses JSON wrapped in bare ``` fences', () => {
    const text = '```\n{"overallScore": 50}\n```';
    const out = tryParseValidationJson(text);
    expect(out).toEqual({ overallScore: 50 });
  });

  it('extracts JSON from a response with a leading commentary paragraph', () => {
    const text =
      'Aquí va el análisis SMART del Key Result propuesto:\n\n{"overallScore": 60, "suggestions": ["añadí baseline"]}';
    const out = tryParseValidationJson(text);
    expect(out).toEqual({ overallScore: 60, suggestions: ['añadí baseline'] });
  });

  it('extracts JSON from a response with trailing commentary', () => {
    const text = '{"overallScore": 40}\n\nEsto refleja la falta de baseline y meta.';
    const out = tryParseValidationJson(text);
    expect(out).toEqual({ overallScore: 40 });
  });

  it('handles surrounding whitespace and newlines', () => {
    const text = '\n\n   {"verdict": "mejorable"}   \n';
    const out = tryParseValidationJson(text);
    expect(out).toEqual({ verdict: 'mejorable' });
  });

  it('returns null for an empty string', () => {
    expect(tryParseValidationJson('')).toBeNull();
    expect(tryParseValidationJson('   \n  ')).toBeNull();
  });

  it('returns null for non-JSON text', () => {
    expect(tryParseValidationJson('this is not JSON at all')).toBeNull();
  });

  it('returns null when the payload is a JSON array, not an object', () => {
    expect(tryParseValidationJson('[1, 2, 3]')).toBeNull();
  });

  it('returns null when the JSON braces are unbalanced and unrecoverable', () => {
    expect(tryParseValidationJson('{"overallScore": 70, "verdict":')).toBeNull();
  });
});
