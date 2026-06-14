import { supabase } from './supabase';

const API_BASE_URL =
  (import.meta.env.VITE_MOCKJ_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => '');
  if (text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html')) {
    throw new Error(
      'Stripe checkout API is not available on this host. Point the app to the MockJ API host or deploy the /api routes with this site.'
    );
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function postApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      (data && typeof data === 'object' && 'error' in data ? String(data.error) : '') ||
        `Request failed with status ${response.status}`
    );
  }

  return data as T;
}

export async function postAuthedApi<T>(path: string, body?: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be signed in to use this action.');
  }

  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      (data && typeof data === 'object' && 'error' in data ? String(data.error) : '') ||
        `Request failed with status ${response.status}`
    );
  }

  return data as T;
}
