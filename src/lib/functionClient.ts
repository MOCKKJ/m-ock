export const DEFAULT_FUNCTIONS_BASE_URL = 'https://zdhketzyvyblkarezdhk.backend.onspace.ai';

export class FunctionCallError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string, message?: string) {
    super(message || responseText || `Function request failed with HTTP ${status}`);
    this.name = 'FunctionCallError';
    this.status = status;
    this.responseText = responseText;
  }
}

export function getFunctionsBaseUrl(): string {
  const configured =
    import.meta.env.VITE_FUNCTIONS_URL ||
    import.meta.env.VITE_ONSPACE_FUNCTIONS_URL ||
    import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
    DEFAULT_FUNCTIONS_BASE_URL;

  return String(configured).replace(/\/+$/, '');
}

export function getPublicApiKey(): string {
  return String(
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      ''
  );
}

export function getFunctionUrl(name: string): string {
  return `${getFunctionsBaseUrl()}/functions/v1/${name}`;
}

export async function callFunction<T = any>(
  name: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
  } = {}
): Promise<T> {
  const apiKey = getPublicApiKey();
  const response = await fetch(getFunctionUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { apikey: apiKey, Authorization: `Bearer ${options.token || apiKey}` } : {}),
      ...options.headers,
    },
    body: JSON.stringify(options.body ?? {}),
  });

  const text = await response.text();

  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error || parsed?.message || text;
    } catch {
      // Keep raw text.
    }
    throw new FunctionCallError(response.status, text, message);
  }

  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}