'use server';
import { cookies } from 'next/headers';

export async function setActiveOrgAction(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set('activeOrgId', orgId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  });
}
