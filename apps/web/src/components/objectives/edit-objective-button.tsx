'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreateObjectiveButton } from './create-objective-button';

interface Props {
  orgId: string;
  objective: {
    id: string;
    title: string;
    description?: string | null;
    ownerUserId?: string | null;
  };
  aiEnabled?: boolean;
  /** When provided, the button is hidden and the caller controls open state externally. */
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

export function EditObjectiveButton({
  orgId,
  objective,
  aiEnabled = true,
  externalOpen,
  onExternalOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = externalOpen !== undefined && onExternalOpenChange !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = isControlled ? onExternalOpenChange : setInternalOpen;

  return (
    <>
      {!isControlled && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Editar objetivo
        </Button>
      )}
      <CreateObjectiveButton
        orgId={orgId}
        mode="edit"
        initialValues={{
          id: objective.id,
          title: objective.title,
          description: objective.description,
          ownerUserId: objective.ownerUserId,
        }}
        open={open}
        onOpenChange={setOpen}
        aiEnabled={aiEnabled}
      />
    </>
  );
}
