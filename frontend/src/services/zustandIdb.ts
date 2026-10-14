import type { StateStorage } from 'zustand/middleware';
import { idbDel, idbGet, idbSet } from './idb';

const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

function flushOne(name: string): Promise<void> {
  const p = pending.get(name);
  if (!p) return Promise.resolve();
  clearTimeout(p.timer);
  pending.delete(name);
  return idbSet('kv', name, p.value);
}

/** Write any debounced state to IndexedDB immediately (called on page hide / in tests). */
export function flushPersistence(): Promise<void[]> {
  return Promise.all([...pending.keys()].map(flushOne));
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushPersistence());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPersistence();
  });
}

/**
 * zustand `persist` storage backed by IndexedDB. Writes are debounced so typing in
 * an editor doesn't serialise the whole store on every keystroke; they are flushed
 * when the page is hidden or closed.
 */
export const idbStateStorage: StateStorage = {
  getItem: async (name) => {
    const p = pending.get(name);
    if (p) return p.value;
    return (await idbGet<string>('kv', name)) ?? null;
  },
  setItem: (name, value) => {
    const prev = pending.get(name);
    if (prev) clearTimeout(prev.timer);
    pending.set(name, { value, timer: setTimeout(() => void flushOne(name), 250) });
  },
  removeItem: async (name) => {
    const p = pending.get(name);
    if (p) clearTimeout(p.timer);
    pending.delete(name);
    await idbDel('kv', name);
  },
};

/** Resolve once a persisted store has finished (async) hydration. */
export function whenHydrated(store: {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}): Promise<void> {
  return new Promise((resolve) => {
    if (store.persist.hasHydrated()) return resolve();
    const off = store.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}
