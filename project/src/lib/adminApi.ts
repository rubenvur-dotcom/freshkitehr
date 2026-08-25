/**
 * Client-side wrappers for the server-side admin API endpoints.
 * All operations require an authenticated admin session — the JWT is sent
 * in the Authorization header and verified server-side.
 */
import { supabase } from './supabase';

async function adminFetch<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({ error: 'Unexpected server response' }));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Request failed');
  return json as T;
}

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  email_confirmed_at: string | null;
}

export async function listAuthUsers(): Promise<AuthUser[]> {
  const data = await adminFetch<{ users: AuthUser[] }>('/api/admin/users/list', {});
  return data.users ?? [];
}

export async function inviteUser(email: string): Promise<void> {
  await adminFetch('/api/admin/users/invite', { email });
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await adminFetch('/api/admin/users/delete', { userId });
}

export async function updateAuthUserEmail(userId: string, email: string): Promise<void> {
  await adminFetch('/api/admin/users/update-email', { userId, email });
}

export async function banUser(userId: string): Promise<void> {
  await adminFetch('/api/admin/users/set-role', { userId, action: 'ban' });
}

export async function unbanUser(userId: string): Promise<void> {
  await adminFetch('/api/admin/users/set-role', { userId, action: 'unban' });
}

export async function forceSignOut(userId: string): Promise<void> {
  await adminFetch('/api/admin/users/set-role', { userId, action: 'signout' });
}

export async function serverStorageMove(fromPath: string, toPath: string, docId: string, newUrl: string): Promise<void> {
  await adminFetch('/api/admin/storage/move', { fromPath, toPath, docId, newUrl });
}
