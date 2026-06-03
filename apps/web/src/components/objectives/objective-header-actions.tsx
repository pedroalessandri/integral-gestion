'use client';

import { useState } from 'react';
import { OwnerPill } from './owner-pill';
import { EditObjectiveButton } from './edit-objective-button';
import type { OwnerSummaryDto } from '@gestion-publica/shared-types/okr';

interface Props {
  orgId: string;
  objective: {
    id: string;
    title: string;
    description?: string | null;
    ownerUserId?: string | null;
    owner: OwnerSummaryDto | null;
  };
  isReadOnly: boolean;
  aiEnabled?: boolean;
}

/**
 * Client island that owns the "edit objective" dialog open state.
 * Renders both the EditObjectiveButton (when not read-only) and the OwnerPill.
 * The OwnerPill click opens the same edit dialog when not read-only.
 */
export function ObjectiveHeaderActions({ orgId, objective, isReadOnly, aiEnabled = true }: Props) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Owner pill — interactive in edit mode, static in read-only mode */}
      <OwnerPill
        owner={objective.owner}
        size="md"
        onClick={!isReadOnly ? () => setEditOpen(true) : undefined}
      />

      {/* Edit button — renders only when editable; shares open state with OwnerPill */}
      {!isReadOnly && (
        <EditObjectiveButton
          orgId={orgId}
          objective={objective}
          aiEnabled={aiEnabled}
          externalOpen={editOpen}
          onExternalOpenChange={setEditOpen}
        />
      )}
    </div>
  );
}
