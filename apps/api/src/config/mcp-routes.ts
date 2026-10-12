import { RequestMethod } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';

/**
 * Rutas del conector MCP (ADR-0010 D2/D3). Viven FUERA del prefijo global `api` y del versionado URI:
 * `/mcp` es la URL que el usuario pega en el cliente y además el identificador del recurso (audiencia del token).
 */
export const MCP_ENDPOINT_PATH = 'mcp';
export const PROTECTED_RESOURCE_METADATA_PATH = '.well-known/oauth-protected-resource';

/** Rutas excluidas de `setGlobalPrefix('api')`. */
export const MCP_PREFIX_EXCLUDES: RouteInfo[] = [
  { path: MCP_ENDPOINT_PATH, method: RequestMethod.ALL },
  { path: PROTECTED_RESOURCE_METADATA_PATH, method: RequestMethod.ALL },
  { path: `${PROTECTED_RESOURCE_METADATA_PATH}/${MCP_ENDPOINT_PATH}`, method: RequestMethod.ALL },
];

/** ¿La URL pedida es del conector MCP o de su metadata? (para saltear CORS del navegador). */
export function isMcpRoutePath(url: string | undefined): boolean {
  if (!url) return false;
  const path = (url.split('?')[0] ?? '').replace(/\/+$/, '');
  return (
    path === `/${MCP_ENDPOINT_PATH}` ||
    path === `/${PROTECTED_RESOURCE_METADATA_PATH}` ||
    path.startsWith(`/${PROTECTED_RESOURCE_METADATA_PATH}/`)
  );
}
