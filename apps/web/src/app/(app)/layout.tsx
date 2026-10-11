import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth0 } from '@/lib/auth0';
import { apiFetch } from '@/lib/api-client';
import { getMe } from '@/lib/me';
import { AppShell } from '@/components/app-shell';

interface AiUsage {
  used: number;
  limit: number;
  percentage: number;
  resetsAt: string;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth0.getSession();
  if (!session) redirect('/auth/login');

  // Compartido con getLabels() vía React.cache: /me se pide una sola vez por request.
  const me = await getMe();

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get('activeOrgId')?.value ?? null;
  const userOrgIds = new Set(me?.orgs.map((o) => o.id) ?? []);
  const validCookieOrg = cookieOrgId && userOrgIds.has(cookieOrgId) ? cookieOrgId : null;
  const effectiveOrgId = validCookieOrg ?? me?.orgs[0]?.id ?? null;

  let aiUsage: AiUsage | null = null;
  if (effectiveOrgId) {
    try {
      const usageRes = await apiFetch('/api/v1/ai/usage', { orgId: effectiveOrgId });
      if (usageRes.ok) aiUsage = await usageRes.json() as AiUsage;
    } catch {
      // aiUsage stays null — banners won't show
    }
  }

  return (
    <AppShell user={session.user} me={me} initialOrgId={effectiveOrgId} aiUsage={aiUsage}>
      {children}
    </AppShell>
  );
}
