'use client';

import { createContext, useContext, useMemo } from 'react';
import type { OrganizationSector } from '@gestion-publica/shared-types/core';
import { getLabelsForSector, type Labels } from './sector-labels';

const LabelsContext = createContext<Labels>(getLabelsForSector('public'));

/** Provee el diccionario de la org activa a los client components (ADR-0011 D3). Lo monta `AppShell`. */
export function LabelsProvider({ sector, children }: { sector: OrganizationSector; children: React.ReactNode }) {
  const labels = useMemo(() => getLabelsForSector(sector), [sector]);
  return <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>;
}

/** Etiquetas compartidas + las del sector de la org activa. Fuera del provider devuelve las del sector público. */
export function useLabels(): Labels {
  return useContext(LabelsContext);
}
