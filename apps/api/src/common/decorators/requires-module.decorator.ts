import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/**
 * Marks a controller (or handler) as belonging to an org-enableable module.
 * ModuleEnabledGuard rejects the request with 403 ModuleDisabled when any of
 * the given module keys is not enabled for the current organization.
 *
 * Per docs/features/indicadores-modelo-comun.md §4.
 */
export const RequiresModule = (...moduleKeys: string[]) =>
  SetMetadata(REQUIRES_MODULE_KEY, moduleKeys);
