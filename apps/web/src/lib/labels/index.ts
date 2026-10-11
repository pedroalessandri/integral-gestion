// Barrel de las etiquetas compartidas (no dependen del sector). Lo que cambia por sector se obtiene con
// `getLabels()` (server, `@/lib/labels/server`) o `useLabels()` (client, `@/lib/labels/labels-provider`).
export * from './shared';
export { getLabelsForSector, getSectorLabels, SECTOR_ERROR_CODES } from './sector-labels';
export type { Labels, SectorErrorCode, SectorLabels } from './sector-labels';
