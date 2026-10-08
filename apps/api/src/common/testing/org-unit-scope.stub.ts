import type { OrgUnitScope } from '../contracts/index.js';

/** Stub del puerto ORG_UNIT_SCOPE para unit tests de services: deja pasar todo (alcance central). */
export function allowAllScope(): OrgUnitScope {
  return {
    assertCanWriteInUnit: async () => undefined,
    assertCentralScope: async () => undefined,
    assertCanWriteInAllUnits: async () => undefined,
  };
}
