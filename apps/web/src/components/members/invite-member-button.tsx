'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { inviteMemberAction } from './actions';

const ROLES = [
  { value: 'org-admin', label: 'Administrador', desc: 'Puede gestionar toda la organización.' },
  { value: 'org-user', label: 'Usuario', desc: 'Puede leer OKR y cargar avances.' },
  { value: 'org-reader', label: 'Lector', desc: 'Solo lectura.' },
] as const;

type RoleKey = (typeof ROLES)[number]['value'];

export function InviteMemberButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState<RoleKey>('org-user');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await inviteMemberAction({ orgId, email, roleKey });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    setEmail('');
    setRoleKey('org-user');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Invitar miembro</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar miembro</DialogTitle>
          <DialogDescription>
            Se creará el usuario si no existe. Cuando ingrese con ese email, accederá a la
            organización con el rol asignado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="persona@dominio.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-neutral-50 transition-colors"
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={r.value}
                    checked={roleKey === r.value}
                    onChange={() => setRoleKey(r.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-sm">{r.label}</div>
                    <div className="text-xs text-neutral-500">{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Invitando...' : 'Invitar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
