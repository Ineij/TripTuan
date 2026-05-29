/**
 * Thin fetch wrapper. Reads VITE_API_BASE from env.
 *
 * All API calls go through this — no USE_MOCK fallback anymore. To point at
 * a different backend, set VITE_API_BASE in .env.local.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export interface RequestOptions extends RequestInit {
  /** Override base URL for this call */
  base?: string;
  /** Auto-parse JSON (default true) */
  json?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { base = BASE, json = true, headers, ...rest } = opts;
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    ...rest,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status}: ${text}`), {
      code: 'HTTP_ERROR',
      status: res.status,
    });
  }
  return json ? (res.json() as Promise<T>) : (res as unknown as T);
}

/** Sleep helper kept for UX-level pacing (e.g. animation cool-downs). */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
