import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiAll, ApiError, API_BASE } from '@/services/api';

const jsonRes = (status: number, body?: unknown, headers: Record<string, string> = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('api client', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=tok%20123; path=/';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('defaults to a same-origin /api base so it works behind one domain', () => {
    expect(API_BASE).toBe('/api');
  });

  it('sends the session cookie and the CSRF token on mutating requests only', async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await api('/notes/x', { method: 'PUT', body: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/notes/x');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('tok 123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');

    await api('/notes');
    const getInit = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((getInit.headers as Record<string, string>)['X-XSRF-TOKEN']).toBeUndefined();
  });

  it('never puts credentials in the URL or touches localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(200, {})));
    await api('/auth/login', { method: 'POST', body: { username: 'ada', password: 'hunter2hunter2' } });
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('hunter2');
  });

  it('turns error responses into ApiError with field errors and Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(400, { message: 'Validation failed', fieldErrors: [{ field: 'username', message: 'too short' }] })));
    await expect(api('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 400, message: 'Validation failed', fieldErrors: [{ field: 'username', message: 'too short' }] });
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(429, { message: 'Slow down' }, { 'Retry-After': '90' })));
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 429, retryAfter: 90 });
  });

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const e = await api('/x').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(0);
    expect((e as ApiError).unreachable).toBe(true);
  });

  it('does not mistake a static host\'s HTML fallback for a Solace backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
    await expect(api('/auth/session')).rejects.toMatchObject({ status: 0 });
  });

  it('handles 204 and non-JSON error pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    expect(await api('/x', { method: 'DELETE' })).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })));
    await expect(api('/x')).rejects.toMatchObject({ status: 502, unreachable: true });
  });

  it('walks every page of a collection', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url, 'http://x').searchParams.get('page'));
      return jsonRes(200, { items: [page * 2, page * 2 + 1], page, size: 2, totalElements: 5, totalPages: 3 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiAll<number>('/notes', 2)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
