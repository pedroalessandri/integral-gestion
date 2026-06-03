/**
 * Re-exports CurrentUser from common/decorators to avoid circular module dependencies.
 * The canonical implementation lives in common/decorators/current-user.decorator.ts
 * because auth/index.ts re-exports auth.guard which imports from audit/context,
 * creating a cycle if auth/index.ts were imported from audit.controller.ts.
 */
export { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
