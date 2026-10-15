import { create } from 'zustand';
import { api, apiAll, ApiError } from '@/services/api';
import { mergeSettings, useSettings } from '@/stores/settingsStore';
import { notify } from '@/stores/notificationStore';
import { DEFAULT_SETTINGS } from '@/app/constants';
import type { Settings } from '@/types/settings';
import { localChanges, planMerge, stableStringify, type Meta } from './plan';
import { SYNC_KINDS, type SyncKind } from './kinds';

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  error: string | null;
  set: (p: Partial<Omit<SyncStatus, 'set'>>) => void;
}

export const useSyncStatus = create<SyncStatus>()((set) => ({ state: 'idle', lastSyncedAt: null, error: null, set: (p) => set(p) }));

/** Settings that stay per-device / per-account rather than following the user around. */
const LOCAL_ONLY: Array<keyof Settings> = ['setupComplete', 'displayName'];

const metaKey = (userId: string, kind: string) => `solace.sync.meta.v1.${userId}.${kind}`;

function loadMeta(userId: string, kind: string): Meta {
  try {
    const raw = localStorage.getItem(metaKey(userId, kind));
    return raw ? (JSON.parse(raw) as Meta) : {};
  } catch {
    return {};
  }
}
function saveMeta(userId: string, kind: string, meta: Meta) {
  try {
    localStorage.setItem(metaKey(userId, kind), JSON.stringify(meta));
  } catch {
    /* storage full / unavailable: next sync just recomputes */
  }
}
export function clearSyncMeta(userId: string) {
  for (const k of SYNC_KINDS) {
    try {
      localStorage.removeItem(metaKey(userId, k.key));
    } catch {
      /* ignore */
    }
  }
}

function describe(e: unknown): { state: SyncState; message: string } {
  if (e instanceof ApiError) {
    if (e.unreachable) return { state: 'offline', message: 'The server can’t be reached. Changes are kept here and will sync when it’s back.' };
    if (e.status === 401) return { state: 'error', message: 'You’ve been signed out. Sign in again to keep syncing.' };
    return { state: 'error', message: e.message };
  }
  return { state: 'error', message: 'Sync failed unexpectedly.' };
}

type Wire = Record<string, unknown>;

class SyncEngine {
  private userId: string | null = null;
  private unsubs: Array<() => void> = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private rerun: 'none' | 'push' | 'full' = 'none';
  private lastPrefsSig = '';
  private onSignedOut: (() => void) | null = null;

  start(userId: string, onSignedOut: () => void) {
    this.stop();
    this.userId = userId;
    this.onSignedOut = onSignedOut;
    for (const k of SYNC_KINDS) this.unsubs.push(k.subscribe(() => this.schedulePush()));
    this.unsubs.push(useSettings.subscribe((s, p) => s.settings !== p.settings && this.schedulePush()));

    const onVisible = () => document.visibilityState === 'visible' && void this.syncNow(false);
    const onOnline = () => void this.syncNow(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const interval = setInterval(() => document.visibilityState === 'visible' && void this.syncNow(false), 120_000);
    this.unsubs.push(() => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    });
    void this.syncNow(true);
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.userId = null;
    this.running = false;
    this.rerun = 'none';
    this.lastPrefsSig = '';
    useSyncStatus.getState().set({ state: 'idle', error: null });
  }

  /** Debounced push of local changes (no download), so typing never hammers the server. */
  private schedulePush() {
    if (!this.userId) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.run('push'), 1200);
  }

  /** Full two-way sync. `first` also adopts the server's preferences. */
  async syncNow(first: boolean) {
    await this.run('full', first);
  }

  private async run(mode: 'push' | 'full', first = false) {
    if (!this.userId) return;
    if (this.running) {
      if (this.rerun !== 'full') this.rerun = mode;
      return;
    }
    const userId = this.userId;
    this.running = true;
    const status = useSyncStatus.getState();
    status.set({ state: 'syncing', error: null });
    try {
      if (mode === 'full') {
        for (const k of SYNC_KINDS) await this.syncKind(userId, k);
        await this.syncPreferences(userId, first);
      } else {
        for (const k of SYNC_KINDS) await this.pushKind(userId, k);
        await this.pushPreferences();
      }
      if (this.userId === userId) status.set({ state: 'idle', lastSyncedAt: Date.now(), error: null });
    } catch (e) {
      const d = describe(e);
      status.set({ state: d.state, error: d.message });
      if (e instanceof ApiError && e.status === 401) this.onSignedOut?.();
    } finally {
      this.running = false;
      const again = this.rerun;
      this.rerun = 'none';
      if (again !== 'none' && this.userId === userId) void this.run(again);
    }
  }

  /* ── records ─────────────────────────────────────────────────── */

  private async upsert<T>(kind: SyncKind<T>, item: T, meta: Meta): Promise<void> {
    const id = kind.ops.id(item);
    try {
      await api(`${kind.path}/${encodeURIComponent(id)}`, { method: 'PUT', body: kind.toWire(item, kind.ops.modified?.(item) ?? Date.now()) });
      meta[id] = kind.ops.sig(item);
    } catch (e) {
      // 409 = someone else saved a newer version; leave it dirty and let the next full sync reconcile.
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
  }

  private async remove<T>(kind: SyncKind<T>, id: string, meta: Meta): Promise<void> {
    try {
      await api(`${kind.path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone is fine
    }
    delete meta[id];
  }

  private async pushKind<T>(userId: string, kind: SyncKind<T>) {
    const meta = loadMeta(userId, kind.key);
    const { push, deleteRemote } = localChanges(kind.items(), meta, kind.ops);
    try {
      for (const item of push) await this.upsert(kind, item, meta);
      for (const id of deleteRemote) await this.remove(kind, id, meta);
    } finally {
      saveMeta(userId, kind.key, meta); // keep whatever succeeded even if a later request failed
    }
  }

  private async syncKind<T>(userId: string, kind: SyncKind<T>) {
    const remoteWire = await apiAll<Wire>(kind.path);
    const remote = remoteWire.map((w) => kind.fromWire(w));
    const meta = loadMeta(userId, kind.key);
    // Plan against the *current* local state (re-read after the network round trip) and apply synchronously.
    const plan = planMerge(kind.items(), remote, meta, kind.ops);
    const before = kind.items();
    const changed = plan.nextLocal.length !== before.length || plan.nextLocal.some((t, i) => kind.ops.sig(t) !== kind.ops.sig(before[i]));
    if (changed) kind.replace(plan.nextLocal);
    Object.assign(meta, plan.synced);
    for (const id of plan.deleteRemote) await this.remove(kind, id, meta);
    // Drop meta for items that vanished on both sides.
    const live = new Set([...plan.nextLocal.map(kind.ops.id), ...remote.map(kind.ops.id)]);
    for (const id of Object.keys(meta)) if (!live.has(id) && !plan.deleteRemote.includes(id)) delete meta[id];
    try {
      for (const item of plan.push) await this.upsert(kind, item, meta);
    } finally {
      saveMeta(userId, kind.key, meta);
    }
  }

  /* ── preferences ─────────────────────────────────────────────── */

  private prefsPayload(): Wire {
    const s = { ...useSettings.getState().settings } as unknown as Wire;
    for (const k of LOCAL_ONLY) delete s[k];
    return s;
  }

  private async pushPreferences() {
    const payload = this.prefsPayload();
    const sig = stableStringify(payload);
    if (sig === this.lastPrefsSig) return;
    await api('/preferences', { method: 'PUT', body: payload });
    this.lastPrefsSig = sig;
  }

  private async syncPreferences(_userId: string, first: boolean) {
    const remote = await api<{ data: Wire } | undefined>('/preferences');
    if (remote && first) {
      // Adopt this account's saved look-and-feel on sign-in; identity fields stay local.
      const merged = mergeSettings(DEFAULT_SETTINGS, { ...remote.data, ...Object.fromEntries(LOCAL_ONLY.map((k) => [k, useSettings.getState().settings[k]])) });
      if (stableStringify(merged) !== stableStringify(useSettings.getState().settings)) useSettings.setState({ settings: merged });
      this.lastPrefsSig = stableStringify(this.prefsPayload());
      return;
    }
    await this.pushPreferences();
  }
}

export const syncEngine = new SyncEngine();

export function reportSyncProblem(message: string) {
  notify({ title: 'Sync problem', body: message, level: 'warning', appId: 'settings' });
}
