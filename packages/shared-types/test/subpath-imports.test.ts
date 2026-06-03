import { describe, it, expect } from 'vitest';
import * as okr from '../src/okr/index.js';
import * as core from '../src/core/index.js';
import * as auth from '../src/auth/index.js';
import * as audit from '../src/audit/index.js';
import * as common from '../src/common/index.js';

describe('subpath namespace exports', () => {
  it('auth exports at least one runtime value', () => {
    expect(typeof auth.ALL_PERMISSIONS).toBe('string');
    expect(typeof auth.hasPermission).toBe('function');
  });

  it('okr namespace exports are present (type-only, no runtime values expected)', () => {
    // okr has no runtime values — just checking import resolves without error
    expect(okr).toBeDefined();
  });

  it('core namespace exports are present', () => {
    expect(core).toBeDefined();
  });

  it('audit namespace exports are present', () => {
    expect(audit).toBeDefined();
  });

  it('common namespace exports are present', () => {
    expect(common).toBeDefined();
  });
});
