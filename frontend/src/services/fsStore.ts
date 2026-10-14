import { create } from 'zustand';
import { idbDel, idbGet, idbGetAll, idbSet } from './idb';
import { uid } from '@/utils/id';

/**
 * "Solace Files": a virtual file system persisted in this browser's IndexedDB.
 * Metadata lives in the `fs` object store, file bytes in `blobs` (keyed `file:<id>`).
 * These files are NOT on the user's real disk and are not synchronised anywhere.
 */
export interface FsEntry {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  parentId: string | null;
  size: number;
  mime: string;
  created: number;
  modified: number;
  /** Set while in the trash. `parentId` is kept so the entry can be restored. */
  trashedAt: number | null;
}

export const ROOT_ID = 'root';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const blobKey = (id: string) => `file:${id}`;

interface FsState {
  loaded: boolean;
  entries: Record<string, FsEntry>;
  load: () => Promise<void>;
  createFolder: (parentId: string, name: string) => Promise<FsEntry>;
  createTextFile: (parentId: string, name: string, text: string) => Promise<FsEntry>;
  importFiles: (parentId: string, files: File[]) => Promise<{ added: FsEntry[]; rejected: Array<{ name: string; reason: string }> }>;
  rename: (id: string, name: string) => Promise<void>;
  move: (ids: string[], parentId: string) => Promise<void>;
  copy: (ids: string[], parentId: string) => Promise<void>;
  trash: (ids: string[]) => Promise<void>;
  restore: (ids: string[]) => Promise<void>;
  deleteForever: (ids: string[]) => Promise<void>;
  emptyTrash: () => Promise<number>;
  readBlob: (id: string) => Promise<Blob | null>;
  writeText: (id: string, text: string) => Promise<void>;
  reset: () => Promise<void>;
}

export const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Name cannot be empty.';
  if (n.length > 120) return 'Name is too long (120 characters max).';
  if (n === '.' || n === '..') return 'That name is not allowed.';
  if (INVALID_NAME.test(n)) return 'Names cannot contain \\ / : * ? " < > |';
  return null;
}

function splitExt(name: string): [string, string] {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

export function guessMime(name: string, fallback = ''): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv', html: 'text/html', css: 'text/css', js: 'text/javascript', ts: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  };
  return map[ext] ?? (fallback || 'application/octet-stream');
}

export function isTextLike(e: Pick<FsEntry, 'mime' | 'name'>): boolean {
  return e.mime.startsWith('text/') || e.mime === 'application/json' || /\.(txt|md|json|csv|log|ini|yml|yaml|xml|html|css|js|ts|tsx|jsx)$/i.test(e.name);
}

export function childrenOf(entries: Record<string, FsEntry>, parentId: string, trashed = false): FsEntry[] {
  return Object.values(entries).filter((e) => e.parentId === parentId && (trashed ? e.trashedAt !== null : e.trashedAt === null));
}

export function uniqueName(entries: Record<string, FsEntry>, parentId: string, name: string, ignoreId?: string): string {
  const siblings = new Set(Object.values(entries).filter((e) => e.parentId === parentId && e.trashedAt === null && e.id !== ignoreId).map((e) => e.name.toLowerCase()));
  if (!siblings.has(name.toLowerCase())) return name;
  const [base, ext] = splitExt(name);
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!siblings.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

export function pathOf(entries: Record<string, FsEntry>, id: string): FsEntry[] {
  const out: FsEntry[] = [];
  let cur: FsEntry | undefined = entries[id];
  let guard = 0;
  while (cur && guard++ < 100) {
    out.unshift(cur);
    cur = cur.parentId ? entries[cur.parentId] : undefined;
  }
  return out;
}

export function descendantIds(entries: Record<string, FsEntry>, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of Object.values(entries)) if (e.parentId === cur) {
      out.push(e.id);
      stack.push(e.id);
    }
  }
  return out;
}

/** False for anything inside a trashed folder (those entries stay stored but are hidden). */
export function isReachable(entries: Record<string, FsEntry>, e: FsEntry): boolean {
  let cur: FsEntry | undefined = e;
  let guard = 0;
  while (cur && guard++ < 100) {
    if (cur.trashedAt !== null) return false;
    cur = cur.parentId ? entries[cur.parentId] : undefined;
  }
  return true;
}

export function usedBytes(entries: Record<string, FsEntry>): number {
  return Object.values(entries).reduce((n, e) => n + (e.kind === 'file' ? e.size : 0), 0);
}

const mkFolder = (name: string, parentId: string | null, id = uid('fld')): FsEntry => ({ id, name, kind: 'folder', parentId, size: 0, mime: 'inode/directory', created: Date.now(), modified: Date.now(), trashedAt: null });

async function put(e: FsEntry) {
  await idbSet('fs', e.id, e);
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

export class FsError extends Error {}

export const useFs = create<FsState>()((set, get) => {
  const apply = (changed: FsEntry[], removed: string[] = []) =>
    set((s) => {
      const entries = { ...s.entries };
      for (const c of changed) entries[c.id] = c;
      for (const r of removed) delete entries[r];
      return { entries };
    });

  const subtree = (ids: string[]) => {
    const { entries } = get();
    return [...new Set(ids.flatMap((id) => [id, ...descendantIds(entries, id)]))];
  };

  return {
    loaded: false,
    entries: {},

    load: async () => {
      if (get().loaded) return;
      const rows = await idbGetAll<FsEntry>('fs');
      const entries: Record<string, FsEntry> = {};
      for (const [, e] of rows) entries[e.id] = e;
      const created: FsEntry[] = [];
      if (!entries[ROOT_ID]) created.push(mkFolder('Solace Files', null, ROOT_ID));
      if (rows.length === 0) for (const n of ['Documents', 'Pictures', 'Downloads']) created.push(mkFolder(n, ROOT_ID));
      for (const c of created) {
        entries[c.id] = c;
        await put(c);
      }
      set({ entries, loaded: true });
    },

    createFolder: async (parentId, name) => {
      const err = validateName(name);
      if (err) throw new FsError(err);
      const f = mkFolder(uniqueName(get().entries, parentId, name.trim()), parentId);
      await put(f);
      apply([f]);
      return f;
    },

    createTextFile: async (parentId, name, text) => {
      const err = validateName(name);
      if (err) throw new FsError(err);
      const clean = uniqueName(get().entries, parentId, name.trim());
      const blob = new Blob([text], { type: 'text/plain' });
      const e: FsEntry = { id: uid('fil'), name: clean, kind: 'file', parentId, size: blob.size, mime: guessMime(clean, 'text/plain'), created: Date.now(), modified: Date.now(), trashedAt: null };
      try {
        await idbSet('blobs', blobKey(e.id), blob);
        await put(e);
      } catch (x) {
        throw new FsError(isQuotaError(x) ? 'Browser storage is full.' : 'Could not save the file.');
      }
      apply([e]);
      return e;
    },

    importFiles: async (parentId, files) => {
      const added: FsEntry[] = [];
      const rejected: Array<{ name: string; reason: string }> = [];
      for (const f of files) {
        const err = validateName(f.name);
        if (err) {
          rejected.push({ name: f.name, reason: err });
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          rejected.push({ name: f.name, reason: 'Larger than 25 MB.' });
          continue;
        }
        const name = uniqueName({ ...get().entries, ...Object.fromEntries(added.map((a) => [a.id, a])) }, parentId, f.name.trim());
        const e: FsEntry = { id: uid('fil'), name, kind: 'file', parentId, size: f.size, mime: f.type || guessMime(name), created: Date.now(), modified: Date.now(), trashedAt: null };
        try {
          await idbSet('blobs', blobKey(e.id), f);
          await put(e);
          added.push(e);
        } catch (x) {
          rejected.push({ name: f.name, reason: isQuotaError(x) ? 'Browser storage is full.' : 'Could not be stored.' });
        }
      }
      apply(added);
      return { added, rejected };
    },

    rename: async (id, name) => {
      const e = get().entries[id];
      if (!e || id === ROOT_ID) return;
      const err = validateName(name);
      if (err) throw new FsError(err);
      const next = { ...e, name: uniqueName(get().entries, e.parentId ?? ROOT_ID, name.trim(), id), modified: Date.now() };
      await put(next);
      apply([next]);
    },

    move: async (ids, parentId) => {
      const { entries } = get();
      const target = entries[parentId];
      if (!target || target.kind !== 'folder') throw new FsError('Destination is not a folder.');
      const changed: FsEntry[] = [];
      for (const id of ids) {
        const e = entries[id];
        if (!e || id === ROOT_ID || e.parentId === parentId) continue;
        if (e.kind === 'folder' && (id === parentId || descendantIds(entries, id).includes(parentId))) throw new FsError("A folder can't be moved into itself.");
        const next = { ...e, parentId, name: uniqueName(entries, parentId, e.name, id), modified: Date.now() };
        await put(next);
        changed.push(next);
      }
      apply(changed);
    },

    copy: async (ids, parentId) => {
      const { entries } = get();
      const created: FsEntry[] = [];
      const copyOne = async (src: FsEntry, dest: string, forceName?: string) => {
        const name = forceName ?? uniqueName({ ...entries, ...Object.fromEntries(created.map((c) => [c.id, c])) }, dest, src.kind === 'file' && dest === src.parentId ? withCopySuffix(src.name) : src.name);
        const e: FsEntry = { ...src, id: uid(src.kind === 'folder' ? 'fld' : 'fil'), name, parentId: dest, created: Date.now(), modified: Date.now(), trashedAt: null };
        if (src.kind === 'file') {
          const blob = await idbGet<Blob>('blobs', blobKey(src.id));
          if (blob) await idbSet('blobs', blobKey(e.id), blob);
        }
        await put(e);
        created.push(e);
        if (src.kind === 'folder') for (const c of childrenOf(entries, src.id)) await copyOne(c, e.id, c.name);
      };
      for (const id of ids) {
        const e = entries[id];
        if (!e || id === ROOT_ID) continue;
        if (e.kind === 'folder' && (id === parentId || descendantIds(entries, id).includes(parentId))) throw new FsError("A folder can't be copied into itself.");
        await copyOne(e, parentId);
      }
      apply(created);
    },

    trash: async (ids) => {
      const now = Date.now();
      const changed: FsEntry[] = [];
      for (const id of ids) {
        const e = get().entries[id];
        if (!e || id === ROOT_ID || e.trashedAt !== null) continue;
        const next = { ...e, trashedAt: now };
        await put(next);
        changed.push(next);
      }
      apply(changed);
    },

    restore: async (ids) => {
      const { entries } = get();
      const changed: FsEntry[] = [];
      for (const id of ids) {
        const e = entries[id];
        if (!e || e.trashedAt === null) continue;
        // If the original folder is gone or trashed, restore to the root.
        const parent = e.parentId ? entries[e.parentId] : undefined;
        const parentId = parent && parent.trashedAt === null ? parent.id : ROOT_ID;
        const next = { ...e, parentId, name: uniqueName(entries, parentId, e.name, id), trashedAt: null };
        await put(next);
        changed.push(next);
      }
      apply(changed);
    },

    deleteForever: async (ids) => {
      const all = subtree(ids).filter((id) => id !== ROOT_ID);
      for (const id of all) {
        const e = get().entries[id];
        if (e?.kind === 'file') await idbDel('blobs', blobKey(id));
        await idbDel('fs', id);
      }
      apply([], all);
    },

    emptyTrash: async () => {
      const top = Object.values(get().entries).filter((e) => e.trashedAt !== null);
      const ids = top.map((e) => e.id);
      await get().deleteForever(ids);
      return ids.length;
    },

    readBlob: async (id) => (await idbGet<Blob>('blobs', blobKey(id))) ?? null,

    writeText: async (id, text) => {
      const e = get().entries[id];
      if (!e || e.kind !== 'file') throw new FsError('That file no longer exists.');
      const blob = new Blob([text], { type: e.mime || 'text/plain' });
      try {
        await idbSet('blobs', blobKey(id), blob);
        const next = { ...e, size: blob.size, modified: Date.now() };
        await put(next);
        apply([next]);
      } catch (x) {
        throw new FsError(isQuotaError(x) ? 'Browser storage is full.' : 'Could not save the file.');
      }
    },

    reset: async () => {
      for (const id of Object.keys(get().entries)) {
        await idbDel('fs', id);
        await idbDel('blobs', blobKey(id));
      }
      set({ entries: {}, loaded: false });
      await get().load();
    },
  };
});

function withCopySuffix(name: string): string {
  const [base, ext] = splitExt(name);
  return `${base} copy${ext}`;
}
