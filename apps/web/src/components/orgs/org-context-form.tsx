'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateOrganizationAction } from './actions';

interface Org {
  id: string;
  name: string;
  slug: string;
  mission?: string | null;
  vision?: string | null;
  values?: string | null;
  context?: string | null;
}

export function OrgContextForm({ organization }: { organization: Org }) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [mission, setMission] = useState(organization.mission ?? '');
  const [vision, setVision] = useState(organization.vision ?? '');
  const [values, setValues] = useState(organization.values ?? '');
  const [context, setContext] = useState(organization.context ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const result = await updateOrganizationAction({
      orgId: organization.id,
      name: name !== organization.name ? name : undefined,
      mission: mission || null,
      vision: vision || null,
      values: values || null,
      context: context || null,
    });

    setSaving(false);

    if (result.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    setMessage({ type: 'success', text: 'Configuración guardada.' });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-neutral-200/60 shadow-sm p-6 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mission">Misión</Label>
        <Textarea
          id="mission"
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="Ej: Facilitar el acceso de los ciudadanos a los servicios públicos mediante tecnología accesible..."
          rows={3}
          maxLength={5000}
        />
        <p className="text-xs text-neutral-500">Para qué existe la organización. El copilot AI lo usa como contexto al redactar objetivos.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vision">Visión</Label>
        <Textarea
          id="vision"
          value={vision}
          onChange={(e) => setVision(e.target.value)}
          placeholder="Ej: Ser la organización líder en servicios públicos digitales del país..."
          rows={3}
          maxLength={5000}
        />
        <p className="text-xs text-neutral-500">El estado futuro al que aspira la organización.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="values">Valores</Label>
        <Textarea
          id="values"
          value={values}
          onChange={(e) => setValues(e.target.value)}
          placeholder="Ej: Transparencia, cercanía, innovación, respeto por el ciudadano..."
          rows={3}
          maxLength={5000}
        />
        <p className="text-xs text-neutral-500">Principios que guían la toma de decisiones.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="context">Contexto adicional</Label>
        <Textarea
          id="context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ej: Prioridad del período: mejorar tiempos de respuesta en atención telefónica. Consideraciones: presupuesto acotado, equipo nuevo en onboarding..."
          rows={4}
          maxLength={5000}
        />
        <p className="text-xs text-neutral-500">Información adicional que ayude al copilot a sugerir mejor (prioridades del período, restricciones, etc.).</p>
      </div>

      {message && (
        <div className={`rounded-md p-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
