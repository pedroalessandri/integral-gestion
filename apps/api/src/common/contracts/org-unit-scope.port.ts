import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * Puerto `ORG_UNIT_SCOPE` (ADR-0009 D5; RN-P19, RN-P20, RN-P21).
 *
 * Lo implementa `core` (dueño de `core.org_unit` y de `user_organization_role.org_unit_id`) y lo inyectan
 * `okr`, `metrics` y `planning` para chequear el alcance de ESCRITURA de unidad. El chequeo es adicional al RBAC
 * (permiso del rol): permiso = RBAC ∧ alcance. Las lecturas nunca se restringen (RN-P20).
 *
 * Todos los métodos lanzan `ForbiddenException('OrgUnitScopeForbidden: ...')` (403 tipado) si no corresponde.
 * La respuesta es independiente del rol: el que pregunta es el `AuthContext` del request.
 */
export interface OrgUnitScope {
  /**
   * El actor puede escribir en `orgUnitId`: alcance `null`/superadmin (toda la org), o la unidad del actor
   * y sus descendientes. `orgUnitId = null` (sin unidad) solo lo pasa el alcance `null`.
   */
  assertCanWriteInUnit(authContext: AuthContext, orgUnitId: string | null): Promise<void>;
  /** El actor tiene alcance `null` (toda la org) o es superadmin. N1, N2 y árbol de unidades (RN-P19). */
  assertCentralScope(authContext: AuthContext): Promise<void>;
  /** Igual que `assertCanWriteInUnit` pero sobre varias unidades; deben pasar todas. Lista vacía → solo alcance `null`. */
  assertCanWriteInAllUnits(authContext: AuthContext, orgUnitIds: ReadonlyArray<string | null>): Promise<void>;
}

export const ORG_UNIT_SCOPE = Symbol('ORG_UNIT_SCOPE');
