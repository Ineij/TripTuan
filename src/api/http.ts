/**
 * Thin fetch wrapper. Reads VITE_API_BASE from env.
 * If the env var is empty / "mock", calls fall through to mock data instead
 * of hitting the network — flip `VITE_USE_MOCK=true` once a real backend is up.
 *
 * Teammates: extend `request()` with auth headers, retry, error normalization.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
export const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK as string | undefined) !== 'false';

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
      // TODO teammate: inject auth here, e.g.
      // 'Authorization': `Bearer ${getToken()}`,
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

/** Sleep helper used by mock implementations to simulate latency */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
