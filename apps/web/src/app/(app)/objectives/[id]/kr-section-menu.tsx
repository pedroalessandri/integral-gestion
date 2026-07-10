'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateKrButton } from '@/components/objectives/create-kr-button';
import { RebalanceWeightsDialog } from '@/components/objectives/rebalance-weights-dialog';

interface KrLite {
  id: string;
  title: string;
  weightBp: number;
}

interface Props {
  orgId: string;
  objectiveId: string;
  objectiveTitle: string;
  /** Used by both the rebalance dialog and the AI suggest panel inside CreateKr. */
  keyResults: KrLite[];
  aiEnabled?: boolean;
  /** M2: forwarded to CreateKrButton to show the "Modo de progreso" selector. */
  indicadoresOkrEnabled?: boolean;
  periodId?: string;
}

/** Header-level kebab for the "Resultados Clave" card.
 *
 * Replaces the previous pair of inline buttons ("+ Nuevo Resultado Clave" and
 * "Rebalancear pesos"). Both actions are now options inside a single dropdown
 * to keep the section header lighter visually.
 *
 * The "Rebalancear pesos" item only appears when there are at least 2 KRs —
 * matching the previous gating logic. */
export function KrSectionMenu({
  orgId,
  objectiveId,
  objectiveTitle,
  keyResults,
  aiEnabled = true,
  indicadoresOkrEnabled = false,
  periodId,
}: Props) {
  const [newKrOpen, setNewKrOpen] = useState(false);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const canRebalance = keyResults.length >= 2;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Acciones de Resultados Clave"
            className="h-7 w-7 p-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setNewKrOpen(true);
            }}
            className="font-semibold"
          >
            + Nuevo Resultado Clave
          </DropdownMenuItem>
          {canRebalance && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setRebalanceOpen(true);
              }}
            >
              Rebalancear pesos
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateKrButton
        orgId={orgId}
        objectiveId={objectiveId}
        objectiveContext={objectiveTitle}
        aiEnabled={aiEnabled}
        open={newKrOpen}
        onOpenChange={setNewKrOpen}
        indicadoresOkrEnabled={indicadoresOkrEnabled}
        periodId={periodId}
      />

      {canRebalance && (
        <RebalanceWeightsDialog
          orgId={orgId}
          objectiveId={objectiveId}
          keyResults={keyResults}
          open={rebalanceOpen}
          onOpenChange={setRebalanceOpen}
        />
      )}
    </>
  );
}
