import { vi } from 'vitest';

type Json = Record<string, unknown>;

/** An in-memory stand-in for the Solace backend, speaking the same wire format, installed as global fetch. */
export class FakeServer {
  users = new Map<string, { id: string; username: string; password: string; displayName: string }>();
  signedIn: string | null = null;
  records: Record<'notes' | 'tasks' | 'events', Map<string, Json>> = { notes: new Map(), tasks: new Map(), events: new Map() };
  prefs: Json | null = null;
  files = new Map<string, { id: string; parentId?: string; name: string; kind: 'file' | 'folder'; mimeType: string; size: number; createdAt: string; updatedAt: string; trashedAt?: string; text?: string }>();
  quota = 1000;
  down = false;
  failNext: { status: number; message: string; retryAfter?: number } | null = null;
  calls: Array<{ method: string; path: string; body?: unknown }> = [];
  private seq = 1;

  install() {
    vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => this.handle(url, init));
    return this;
  }

  private json(status: number, body?: unknown, headers: Record<string, string> = {}) {
    return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } }));
  }
  private err(status: number, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return this.json(status, { status, error: 'Error', message, ...extra }, headers);
  }

  private page<T>(items: T[], url: URL) {
    const size = Number(url.searchParams.get('size') ?? 100);
    const page = Number(url.searchParams.get('page') ?? 0);
    return { items: items.slice(page * size, page * size + size), page, size, totalElements: items.length, totalPages: Math.max(1, Math.ceil(items.length / size)) };
  }

  private async handle(rawUrl: string, init: RequestInit): Promise<Response> {
    if (this.down) throw new TypeError('Failed to fetch');
    const url = new URL(rawUrl, 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    let body: unknown;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    this.calls.push({ method, path, body });
    if (this.failNext) {
      const f = this.failNext;
      this.failNext = null;
      return this.err(f.status, f.message, {}, f.retryAfter ? { 'Retry-After': String(f.retryAfter) } : {});
    }

    const me = this.signedIn ? this.users.get(this.signedIn) : undefined;
    const pub = (u: { id: string; username: string; displayName: string }) => ({ id: u.id, username: u.username, displayName: u.displayName });

    if (path === '/auth/session') return this.json(200, me ? { authenticated: true, user: pub(me) } : { authenticated: false });
    if (path === '/auth/register' && method === 'POST') {
      const b = body as Json;
      const name = String(b.username);
      if (name.length < 3) return this.err(400, 'Validation failed', { fieldErrors: [{ field: 'username', message: 'Username must be 3–32 characters' }] });
      if ([...this.users.values()].some((u) => u.username.toLowerCase() === name.toLowerCase())) return this.err(409, 'That username is already taken');
      const u = { id: `u${this.seq++}`, username: name, password: String(b.password), displayName: String(b.displayName || name) };
      this.users.set(u.id, u);
      this.signedIn = u.id;
      return this.json(201, pub(u));
    }
    if (path === '/auth/login' && method === 'POST') {
      const b = body as Json;
      const u = [...this.users.values()].find((x) => x.username.toLowerCase() === String(b.username).toLowerCase());
      if (!u || u.password !== b.password) return this.err(401, 'Invalid username or password');
      this.signedIn = u.id;
      return this.json(200, pub(u));
    }
    if (path === '/auth/logout') {
      this.signedIn = null;
      return this.json(204);
    }
    if (!me) return this.err(401, 'Authentication required');

    if (path === '/users/me' && method === 'PATCH') {
      me.displayName = String((body as Json).displayName);
      return this.json(200, pub(me));
    }
    if (path === '/users/me' && method === 'DELETE') {
      if ((body as Json).password !== me.password) return this.err(400, 'Password is incorrect');
      this.users.delete(me.id);
      this.signedIn = null;
      return this.json(204);
    }
    if (path === '/preferences') {
      if (method === 'GET') return this.prefs ? this.json(200, { data: this.prefs, updatedAt: new Date().toISOString() }) : this.json(204);
      this.prefs = body as Json;
      return this.json(200, { data: this.prefs, updatedAt: new Date().toISOString() });
    }

    const rec = /^\/(notes|tasks|events)(?:\/([^/]+))?$/.exec(path);
    if (rec) {
      const store = this.records[rec[1] as 'notes' | 'tasks' | 'events'];
      const id = rec[2] ? decodeURIComponent(rec[2]) : null;
      if (!id) return this.json(200, this.page([...store.values()], url));
      if (method === 'GET') return store.has(id) ? this.json(200, store.get(id)) : this.err(404, 'Not found');
      if (method === 'DELETE') return store.delete(id) ? this.json(204) : this.err(404, 'Not found');
      if (method === 'PUT') {
        const prev = store.get(id);
        const b = body as Json;
        if (prev && Number(b.updatedAt) < Number(prev.updatedAt)) return this.err(409, 'A newer version exists');
        store.set(id, { ...b, id });
        return this.json(prev ? 200 : 201, { ...b, id });
      }
    }

    if (path === '/files/usage') return this.json(200, { usedBytes: [...this.files.values()].reduce((n, f) => n + f.size, 0), quotaBytes: this.quota, maxFileBytes: 400 });
    if (path === '/files/trash') {
      if (method === 'DELETE') {
        const gone = [...this.files.values()].filter((f) => f.trashedAt);
        gone.forEach((f) => this.files.delete(f.id));
        return this.json(200, { deleted: gone.length });
      }
      return this.json(200, this.page([...this.files.values()].filter((f) => f.trashedAt), url));
    }
    if (path === '/files/folders' && method === 'POST') {
      const b = body as Json;
      const f = { id: `f${this.seq++}`, parentId: b.parentId as string | undefined, name: String(b.name), kind: 'folder' as const, mimeType: 'inode/directory', size: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      this.files.set(f.id, f);
      return this.json(201, f);
    }
    if (path === '/files' && method === 'GET') {
      const parent = url.searchParams.get('parentId') ?? undefined;
      return this.json(200, this.page([...this.files.values()].filter((f) => !f.trashedAt && f.parentId === parent), url));
    }
    if (path === '/files' && method === 'POST') {
      const form = init.body as FormData;
      const file = form.get('file') as File;
      const used = [...this.files.values()].reduce((n, f) => n + f.size, 0);
      if (file.size > 400) return this.err(413, 'Files can be at most 400 bytes');
      if (!/\.(txt|png|pdf)$/i.test(file.name)) return this.err(422, 'That file type is not supported');
      if (used + file.size > this.quota) return this.err(507, 'Your storage quota is full');
      const f = { id: `f${this.seq++}`, parentId: url.searchParams.get('parentId') ?? undefined, name: file.name, kind: 'file' as const, mimeType: file.type || 'text/plain', size: file.size, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), text: await file.text() };
      this.files.set(f.id, f);
      return this.json(201, f);
    }
    const fm = /^\/files\/([^/]+)(\/content|\/restore)?$/.exec(path);
    if (fm) {
      const f = this.files.get(decodeURIComponent(fm[1]));
      if (!f) return this.err(404, 'Item not found');
      if (fm[2] === '/content') return Promise.resolve(new Response(f.text ?? '', { status: 200, headers: { 'Content-Type': f.mimeType } }));
      if (fm[2] === '/restore') {
        delete f.trashedAt;
        return this.json(200, f);
      }
      if (method === 'PATCH') {
        const b = body as Json;
        if (typeof b.name === 'string') f.name = b.name;
        return this.json(200, f);
      }
      if (method === 'DELETE') {
        if (url.searchParams.get('permanent') === 'true') {
          this.files.delete(f.id);
          return this.json(204);
        }
        f.trashedAt = new Date().toISOString();
        return this.json(204);
      }
      return this.json(200, f);
    }
    return this.err(404, 'Not found');
  }
}
