/**
 * Minimal promise wrapper over IndexedDB with an in-memory fallback so the
 * desktop still works (without persistence) when IndexedDB is unavailable,
 * e.g. some private-browsing modes. `idbAvailable()` lets the UI say so honestly.
 */
const DB_NAME = 'solace-os';
const DB_VERSION = 1;
export type StoreName = 'kv' | 'fs' | 'blobs';
const STORES: StoreName[] = ['kv', 'fs', 'blobs'];

let dbPromise: Promise<IDBDatabase> | null = null;
let available = true;
const memory: Record<StoreName, Map<string, unknown>> = { kv: new Map(), fs: new Map(), blobs: new Map() };

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    available = false;
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function idbAvailable(): boolean {
  return available;
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, 'readonly', (s) => s.get(key));
  } catch {
    return memory[store].get(key) as T | undefined;
  }
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.put(value, key));
  } catch {
    memory[store].set(key, value);
  }
}

export async function idbDel(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.delete(key));
  } catch {
    memory[store].delete(key);
  }
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  try {
    return (await run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys())).map(String);
  } catch {
    return [...memory[store].keys()];
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<Array<[string, T]>> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const out: Array<[string, T]> = [];
      const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          out.push([String(c.key), c.value as T]);
          c.continue();
        } else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [...memory[store].entries()] as Array<[string, T]>;
  }
}

export async function idbClear(store: StoreName): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.clear());
  } catch {
    memory[store].clear();
  }
}

/** Test helper: forget the cached connection (used after deleting the database). */
export function __resetIdbForTests(): void {
  dbPromise = null;
  available = true;
  for (const s of STORES) memory[s].clear();
}
