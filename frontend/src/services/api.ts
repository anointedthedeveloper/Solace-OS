/**
 * Minimal fetch wrapper for the Solace backend.
 *  - Same-origin by default (`/api`), configurable with VITE_API_BASE_URL for split deployments.
 *  - Session lives in an HttpOnly cookie the browser manages; no tokens or passwords are ever stored by us.
 *  - Mutating requests echo the XSRF-TOKEN cookie in X-XSRF-TOKEN (double-submit CSRF protection).
 */
export const API_BASE: string = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api').replace(/\/+$/, '');

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: FieldIssue[] = [],
    readonly retryAfter?: number,
  ) {
    super(message);
  }
  /** Status 0 = the request never reached a Solace backend (offline, no server, wrong URL). */
  get unreachable(): boolean {
    return this.status === 0 || this.status >= 502;
  }
}

function readCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

async function request(path: string, opts: RequestOptions): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (method !== 'GET') {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body, credentials: 'include', signal: opts.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('Could not reach the Solace server.', 0);
  }
  if (res.ok) return res;

  let message = res.statusText || 'Request failed';
  let fieldErrors: FieldIssue[] = [];
  try {
    const data = (await res.json()) as { message?: string; fieldErrors?: FieldIssue[] };
    if (data.message) message = data.message;
    if (Array.isArray(data.fieldErrors)) fieldErrors = data.fieldErrors;
  } catch {
    /* non-JSON error body (e.g. a proxy error page) */
  }
  const retry = Number(res.headers.get('Retry-After'));
  throw new ApiError(message, res.status, fieldErrors, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}

/** JSON request. Resolves `undefined` for empty (204) responses. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  if (!type.includes('json')) throw new ApiError('The server did not answer like a Solace backend.', 0);
  return (await res.json()) as T;
}

/** Binary download (file content). */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await request(path, { signal });
  return res.blob();
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Walks every page of a paged collection. */
export async function apiAll<T>(path: string, pageSize = 200): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 1000; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await api<Page<T>>(`${path}${sep}page=${page}&size=${pageSize}`);
    out.push(...res.items);
    if (page + 1 >= res.totalPages) break;
  }
  return out;
}
