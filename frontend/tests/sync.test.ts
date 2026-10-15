import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { localChanges, planMerge, stableStringify } from '@/services/sync/plan';
import { syncEngine, useSyncStatus } from '@/services/sync/engine';
import { notesKind, tasksKind } from '@/services/sync/kinds';
import { useNotes, type Note } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents } from '@/stores/eventsStore';
import { useSettings } from '@/stores/settingsStore';
import { FakeServer } from './fakeServer';
import { resetAll } from './helpers';

interface Item {
  id: string;
  v: string;
  t?: number;
}
const ops = { id: (i: Item) => i.id, sig: (i: Item) => stableStringify(i), modified: (i: Item) => i.t ?? null };
const it1 = (id: string, v: string, t?: number): Item => ({ id, v, ...(t === undefined ? {} : { t }) });
const sigs = (items: Item[]) => Object.fromEntries(items.map((i) => [i.id, ops.sig(i)]));

describe('stableStringify', () => {
  it('is independent of key order and ignores undefined', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }], u: undefined })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(stableStringify(null)).toBe('null');
  });
});

describe('planMerge (three-way merge)', () => {
  it('first sync uploads new local items and downloads new server items', () => {
    const p = planMerge([it1('a', '1')], [it1('b', '2')], {}, ops);
    expect(p.nextLocal.map((i) => i.id)).toEqual(['a', 'b']);
    expect(p.push.map((i) => i.id)).toEqual(['a']);
    expect(p.synced).toEqual({ b: ops.sig(it1('b', '2')) });
    expect(p.deleteRemote).toEqual([]);
  });

  it('identical items are marked as synced without any traffic', () => {
    const x = it1('a', '1');
    const p = planMerge([x], [{ ...x }], {}, ops);
    expect(p.push).toEqual([]);
    expect(p.synced.a).toBe(ops.sig(x));
  });

  it('takes the server copy when only the server changed since the last sync', () => {
    const old = it1('a', 'old');
    const p = planMerge([old], [it1('a', 'new')], sigs([old]), ops);
    expect(p.nextLocal[0].v).toBe('new');
    expect(p.push).toEqual([]);
  });

  it('pushes the local copy when only this device changed', () => {
    const old = it1('a', 'old');
    const p = planMerge([it1('a', 'edited')], [old], sigs([old]), ops);
    expect(p.nextLocal[0].v).toBe('edited');
    expect(p.push.map((i) => i.v)).toEqual(['edited']);
  });

  it('when both changed, the most recently modified side wins', () => {
    const base = it1('a', 'base', 1);
    const localWins = planMerge([it1('a', 'L', 9)], [it1('a', 'R', 5)], sigs([base]), ops);
    expect(localWins.nextLocal[0].v).toBe('L');
    expect(localWins.push).toHaveLength(1);
    const remoteWins = planMerge([it1('a', 'L', 3)], [it1('a', 'R', 7)], sigs([base]), ops);
    expect(remoteWins.nextLocal[0].v).toBe('R');
    expect(remoteWins.push).toHaveLength(0);
    const unknown = planMerge([it1('a', 'L')], [it1('a', 'R')], sigs([it1('a', 'base')]), ops);
    expect(unknown.nextLocal[0].v).toBe('R'); // can't tell → server is the source of truth
  });

  it('never-synced items that differ are resolved by timestamp, else the server', () => {
    expect(planMerge([it1('a', 'L', 9)], [it1('a', 'R', 5)], {}, ops).nextLocal[0].v).toBe('L');
    expect(planMerge([it1('a', 'L')], [it1('a', 'R')], {}, ops).nextLocal[0].v).toBe('R');
  });

  it('propagates deletions made on this device to the server', () => {
    const x = it1('gone', '1');
    const p = planMerge([], [x], sigs([x]), ops);
    expect(p.deleteRemote).toEqual(['gone']);
    expect(p.nextLocal).toEqual([]);
  });

  it('propagates deletions made elsewhere to this device', () => {
    const x = it1('gone', '1');
    const p = planMerge([x], [], sigs([x]), ops);
    expect(p.nextLocal).toEqual([]);
    expect(p.push).toEqual([]);
  });

  it('keeps a local edit even if the server deleted the item meanwhile', () => {
    const base = it1('a', 'base');
    const p = planMerge([it1('a', 'edited')], [], sigs([base]), ops);
    expect(p.nextLocal).toHaveLength(1);
    expect(p.push).toHaveLength(1);
  });

  it('is stable: running the plan twice changes nothing', () => {
    const local = [it1('a', '1'), it1('b', '2')];
    const remote = [it1('b', '2'), it1('c', '3')];
    const first = planMerge(local, remote, {}, ops);
    const second = planMerge(first.nextLocal, [...remote, ...first.push], { ...first.synced, ...sigs(first.push) }, ops);
    expect(second.push).toEqual([]);
    expect(second.deleteRemote).toEqual([]);
    expect(second.nextLocal.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('localChanges reports only what differs from the last synced state', () => {
    const a = it1('a', '1');
    const b = it1('b', '2');
    const c = it1('c', '3');
    const meta = { ...sigs([a, b]), z: 'x' };
    const ch = localChanges([a, it1('b', 'changed'), c], meta, ops);
    expect(ch.push.map((i) => i.id)).toEqual(['b', 'c']);
    expect(ch.deleteRemote).toEqual(['z']);
  });
});

const note = (id: string, over: Partial<Note> = {}): Note => ({ id, title: id, content: '', createdAt: 1, updatedAt: 100, pinned: false, archived: false, ...over });

describe('sync engine against a fake server', () => {
  let server: FakeServer;

  beforeEach(async () => {
    await resetAll();
    localStorage.clear();
    server = new FakeServer().install();
    server.users.set('u1', { id: 'u1', username: 'ada', password: 'x', displayName: 'Ada' });
    server.signedIn = 'u1';
    useSettings.getState().completeSetup({ displayName: 'Ada' });
  });
  afterEach(() => {
    syncEngine.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 30; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 20));
    });
  };

  it('the first sync uploads local data, downloads server data, and adopts server preferences', async () => {
    useNotes.setState({ notes: [note('local1')] });
    useTasks.getState().add({ title: 'Local task' });
    server.records.notes.set('remote1', { id: 'remote1', title: 'From server', content: 'c', pinned: false, archived: false, createdAt: 1, updatedAt: 50 });
    server.prefs = { theme: 'light', accent: 'rose', dock: { position: 'left' } };

    syncEngine.start('u1', () => {});
    await settle();

    expect(server.records.notes.has('local1')).toBe(true);
    expect([...server.records.tasks.values()].map((t) => t.title)).toEqual(['Local task']);
    expect(useNotes.getState().notes.map((n) => n.id).sort()).toEqual(['local1', 'remote1']);
    expect(useSettings.getState().settings).toMatchObject({ theme: 'light', accent: 'rose', displayName: 'Ada', setupComplete: true });
    expect(useSettings.getState().settings.dock.position).toBe('left');
    expect(useSyncStatus.getState().state).toBe('idle');
    expect(useSyncStatus.getState().lastSyncedAt).toBeTypeOf('number');
  });

  it('with no server preferences yet, it uploads this device\'s (without identity fields)', async () => {
    useSettings.getState().update({ theme: 'light' });
    syncEngine.start('u1', () => {});
    await settle();
    expect(server.prefs).toMatchObject({ theme: 'light' });
    expect(server.prefs).not.toHaveProperty('displayName');
    expect(server.prefs).not.toHaveProperty('setupComplete');
  });

  it('pushes edits shortly after they happen (debounced), and deletions too', async () => {
    syncEngine.start('u1', () => {});
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => void useNotes.getState().create({ title: 'typed', content: 'hello' }));
    const id = useNotes.getState().notes[0].id;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    vi.useRealTimers();
    await settle();
    expect(server.records.notes.get(id)).toMatchObject({ title: 'typed', content: 'hello' });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => useNotes.getState().remove(id));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    vi.useRealTimers();
    await settle();
    expect(server.records.notes.has(id)).toBe(false);
  });

  it('a later full sync picks up changes made on another device, including deletions', async () => {
    syncEngine.start('u1', () => {});
    await settle();
    server.records.notes.set('other', { id: 'other', title: 'Made elsewhere', content: '', pinned: false, archived: false, createdAt: 1, updatedAt: 10 });
    await act(async () => syncEngine.syncNow(false));
    await settle();
    expect(useNotes.getState().notes.map((n) => n.id)).toContain('other');
    server.records.notes.delete('other');
    await act(async () => syncEngine.syncNow(false));
    await settle();
    expect(useNotes.getState().notes.map((n) => n.id)).not.toContain('other');
  });

  it('tasks and events round-trip through the wire format', async () => {
    useTasks.getState().add({ title: 'Pay rent', due: '2030-01-31', priority: 'high', details: 'd' });
    useEvents.getState().add({ title: 'Standup', start: 1000, end: 2000, allDay: false, location: 'Room', description: '' });
    syncEngine.start('u1', () => {});
    await settle();
    const wireTask = [...server.records.tasks.values()][0];
    expect(wireTask).toMatchObject({ title: 'Pay rent', due: '2030-01-31', priority: 'high', done: false, completedAt: null });
    expect(wireTask.updatedAt).toBeTypeOf('number');
    // A second device (empty) syncing from the server gets identical items back.
    const roundTrip = tasksKind.fromWire(wireTask);
    expect(roundTrip).toMatchObject({ title: 'Pay rent', due: '2030-01-31', completedAt: null });
    expect(notesKind.fromWire({ id: 'n', title: 't' })).toMatchObject({ content: '', pinned: false, archived: false });
  });

  it('keeps working offline: edits stay local, status says so, and they sync when the server returns', async () => {
    syncEngine.start('u1', () => {});
    await settle();
    server.down = true;
    act(() => void useNotes.getState().create({ title: 'offline note' }));
    await act(async () => syncEngine.syncNow(false));
    await settle();
    expect(useSyncStatus.getState().state).toBe('offline');
    expect(useSyncStatus.getState().error).toMatch(/can’t be reached/);
    expect(useNotes.getState().notes).toHaveLength(1); // nothing lost
    server.down = false;
    await act(async () => syncEngine.syncNow(false));
    await settle();
    expect(useSyncStatus.getState().state).toBe('idle');
    expect(server.records.notes.size).toBe(1);
  });

  it('a stale write (409) is not retried forever and does not crash sync', async () => {
    server.records.notes.set('n1', { id: 'n1', title: 'server newer', content: '', pinned: false, archived: false, createdAt: 1, updatedAt: 9999 });
    useNotes.setState({ notes: [note('n1', { title: 'local older', updatedAt: 5 })] });
    syncEngine.start('u1', () => {});
    await settle();
    expect(useSyncStatus.getState().state).toBe('idle');
    expect(server.records.notes.get('n1')?.title).toBe('server newer');
  });

  it('a 401 during sync signs the user out of sync and tells the app', async () => {
    const onSignedOut = vi.fn();
    server.signedIn = null;
    syncEngine.start('u1', onSignedOut);
    await settle();
    expect(onSignedOut).toHaveBeenCalled();
    expect(useSyncStatus.getState().error).toMatch(/signed out/i);
  });

  it('stopping the engine stops pushing', async () => {
    syncEngine.start('u1', () => {});
    await settle();
    syncEngine.stop();
    server.calls.length = 0;
    act(() => void useNotes.getState().create({ title: 'after stop' }));
    await new Promise((r) => setTimeout(r, 1400));
    expect(server.calls).toEqual([]);
  });
});
