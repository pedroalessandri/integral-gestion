'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  general: React.ReactNode;
  copilot: React.ReactNode;
  /** Módulos tab content — only rendered for superadmins (null otherwise). */
  modulos: React.ReactNode | null;
}

export function SettingsTabs({ general, copilot, modulos }: Props) {
  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="copilot">Copilot AI</TabsTrigger>
        {modulos !== null && <TabsTrigger value="modulos">Módulos</TabsTrigger>}
      </TabsList>

      <TabsContent value="general" className="pt-4">
        {general}
      </TabsContent>
      <TabsContent value="copilot" className="pt-4">
        {copilot}
      </TabsContent>
      {modulos !== null && (
        <TabsContent value="modulos" className="pt-4">
          {modulos}
        </TabsContent>
      )}
    </Tabs>
  );
}
