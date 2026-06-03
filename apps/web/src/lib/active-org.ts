import { cookies } from 'next/headers';

export async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('activeOrgId')?.value ?? null;
}
