import { auth0 } from './auth0';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function apiFetch(
  path: string,
  init?: RequestInit & { orgId?: string },
) {
  const session = await auth0.getSession();
  if (!session) throw new Error('No session');

  const tokenSet = await auth0.getAccessToken();
  const accessToken = tokenSet.token;

  if (!accessToken) throw new Error('No access token');

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (init?.orgId) {
    headers.set('X-Organization-Id', init.orgId);
  }

  // Strip orgId from RequestInit before passing to fetch
  const { orgId: _orgId, ...fetchInit } = init ?? {};

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchInit,
    headers,
    cache: 'no-store',
  });

  return response;
}
