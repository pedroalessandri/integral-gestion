'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { changeMemberRoleAction, removeMemberAction } from './actions';

type RoleKey = 'org-admin' | 'org-user' | 'org-reader';

const ROLE_OPTIONS: Array<{ value: RoleKey; label: string }> = [
  { value: 'org-admin', label: 'Administrador' },
  { value: 'org-user', label: 'Usuario' },
  { value: 'org-reader', label: 'Lector' },
];

interface MemberRowActionsProps {
  orgId: string;
  userId: string;
  displayName: string;
  currentRoleKey: string;
}

export function MemberRowActions({
  orgId,
  userId,
  displayName,
  currentRoleKey,
}: MemberRowActionsProps) {
  const router = useRouter();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  async function handleChangeRole(newRole: RoleKey) {
    if (newRole === currentRoleKey || roleLoading) return;
    setRoleLoading(true);
    const r = await changeMemberRoleAction({ orgId, userId, roleKey: newRole });
    setRoleLoading(false);
    if (r.error) {
      alert(r.error);
      return;
    }
    router.refresh();
  }

  async function handleRemove() {
    if (removeLoading) return;
    setRemoveLoading(true);
    const r = await removeMemberAction({ orgId, userId });
    setRemoveLoading(false);
    if (r.error) {
      alert(r.error);
      return;
    }
    setRemoveOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={`Acciones para ${displayName}`}
            disabled={roleLoading}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Cambiar rol</DropdownMenuLabel>
          {ROLE_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              disabled={opt.value === currentRoleKey}
              onClick={() => handleChangeRole(opt.value)}
            >
              {opt.label}
              {opt.value === currentRoleKey && (
                <span className="ml-auto text-xs text-neutral-500">actual</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => setRemoveOpen(true)}
          >
            Remover de la organización
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover miembro</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a remover a <strong>{displayName}</strong> de esta organización. Perderá acceso
              inmediatamente. Podés volver a invitarlo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removeLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeLoading ? 'Removiendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
