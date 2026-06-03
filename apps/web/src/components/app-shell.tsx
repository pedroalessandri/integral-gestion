'use client';

import { useState, useEffect } from 'react';
import { setActiveOrgAction } from '@/lib/set-active-org-action';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AiUsage {
  used: number;
  limit: number;
  percentage: number;
  resetsAt: string;
}

interface AppShellProps {
  user: {
    name?: string;
    email?: string;
    picture?: string;
  };
  me: {
    userId: string;
    email: string;
    displayName: string;
    isSuperadmin: boolean;
    orgs: Array<{ id: string; slug: string; name: string }>;
  } | null;
  initialOrgId: string | null;
  aiUsage?: AiUsage | null;
  children: React.ReactNode;
}

export function AppShell({ user, me, initialOrgId, aiUsage, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(initialOrgId ?? me?.orgs[0]?.id ?? null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const activeOrg = me?.orgs.find((o) => o.id === activeOrgId) ?? null;

  useEffect(() => {
    if (!initialOrgId) return;
    const cookieOrgId = document.cookie
      .split('; ')
      .find((c) => c.startsWith('activeOrgId='))
      ?.split('=')[1];
    if (cookieOrgId !== initialOrgId) {
      void setActiveOrgAction(initialOrgId);
    }
  }, [initialOrgId]);

  const settingsHref = activeOrgId ? `/orgs/${activeOrgId}/settings` : null;

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/orgs', label: 'Organizaciones', superadminOnly: true },
    { href: '/objectives', label: 'Objetivos', requiresOrg: true },
    { href: '/objectives/executive', label: 'Vista Ejecutiva', requiresOrg: true },
    ...(settingsHref ? [{ href: settingsHref, label: 'Configuración', requiresOrg: true }] : []),
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.superadminOnly && !me?.isSuperadmin) return false;
    if (item.requiresOrg && !activeOrg) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-neutral-50)' }}>
      {/* Sidebar */}
      <aside
        className="w-64 flex flex-col border-r"
        style={{ backgroundColor: 'white', borderColor: 'var(--color-neutral-200)' }}
      >
        {/* Logo area */}
        <div
          className="px-5 py-4 border-b flex items-center gap-3"
          style={{ borderColor: 'var(--color-neutral-200)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm"
            style={{ backgroundColor: 'var(--color-primary-600)' }}
          >
            GI
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-neutral-900)' }}>
              Gestión Integral
            </p>
            <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
              de Organizaciones
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {/* Compute the single best-match href (longest prefix that matches pathname,
              with a trailing-slash boundary so '/orgs' does NOT match '/orgs/abc'). */}
          {(() => {
            const activeHref = visibleNavItems
              .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
              .map((item) => item.href)
              .sort((a, b) => b.length - a.length)[0];
            return visibleNavItems.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center px-3 py-2 rounded-md text-sm font-medium relative"
                style={{
                  color: isActive ? 'var(--color-primary-700)' : 'var(--color-neutral-700)',
                  backgroundColor: isActive ? 'var(--color-primary-50)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--color-primary-600)' : '3px solid transparent',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--color-neutral-100)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                {item.label}
              </Link>
            );
          });
          })()}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="border-b px-6 py-3 flex items-center justify-between shrink-0"
          style={{ backgroundColor: 'white', borderColor: 'var(--color-neutral-200)' }}
        >
          <div className="flex items-center gap-3">
            {me && me.orgs.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 font-medium"
                    style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }}
                  >
                    {activeOrg?.name ?? 'Seleccionar organización'}
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Tus organizaciones</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {me.orgs.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => {
                        const oldOrgId = activeOrgId;
                        setActiveOrgId(org.id);
                        void setActiveOrgAction(org.id).then(() => {
                          if (oldOrgId && pathname.includes(`/${oldOrgId}`)) {
                            const newPath = pathname.replace(`/${oldOrgId}`, `/${org.id}`);
                            router.push(newPath);
                          } else {
                            router.refresh();
                          }
                        });
                      }}
                    >
                      {org.name}
                      {org.id === activeOrgId && (
                        <span className="ml-auto font-medium" style={{ color: 'var(--color-primary-600)' }}>
                          ✓
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge variant="outline" style={{ color: 'var(--color-neutral-500)' }}>
                Sin organizaciones
              </Badge>
            )}
            {me?.isSuperadmin && (
              <Badge
                variant="secondary"
                className="text-xs"
                style={{
                  backgroundColor: 'var(--color-primary-50)',
                  color: 'var(--color-primary-700)',
                  border: '1px solid var(--color-primary-100)',
                }}
              >
                Superadmin
              </Badge>
            )}
          </div>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-md p-1 pr-3 outline-none"
                style={{ transition: 'background-color 150ms ease' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-neutral-100)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                <Avatar
                  className="h-8 w-8 ring-2 ring-transparent transition-all"
                  style={{ transition: 'box-shadow 150ms ease' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 2px var(--color-primary-500)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <AvatarImage src={user.picture} alt={user.name} />
                  <AvatarFallback
                    className="text-white text-xs font-semibold"
                    style={{ backgroundColor: 'var(--color-primary-600)' }}
                  >
                    {(user.name ?? user.email ?? '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium" style={{ color: 'var(--color-neutral-700)' }}>
                  {user.name ?? user.email}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="font-medium" style={{ color: 'var(--color-neutral-900)' }}>{user.name}</div>
                <div className="text-xs font-normal" style={{ color: 'var(--color-neutral-500)' }}>{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/auth/logout">Cerrar sesión</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* AI quota banners — shown only when threshold exceeded, dismissible for low warning */}
        {aiUsage && activeOrgId && aiUsage.percentage >= 80 && !bannerDismissed && (
          <>
            {aiUsage.percentage >= 100 ? (
              <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-800 flex items-center justify-between gap-2">
                <span>
                  El copilot AI está deshabilitado este mes — cuota alcanzada.{' '}
                  <Link href={`/orgs/${activeOrgId}/settings`} className="underline font-medium">
                    Ver detalles
                  </Link>
                </span>
              </div>
            ) : (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800 flex items-center justify-between gap-2">
                <span>
                  Ya usaste {aiUsage.percentage.toFixed(0)}% del copilot AI este mes.{' '}
                  <Link href={`/orgs/${activeOrgId}/settings`} className="underline font-medium">
                    Ver uso
                  </Link>
                </span>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  className="shrink-0 text-amber-700 hover:text-amber-900"
                  aria-label="Cerrar aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 sm:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
