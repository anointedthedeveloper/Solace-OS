import { beforeEach, describe, expect, it } from 'vitest';
import { clampBounds, useWindows } from '@/stores/windowStore';
import { requestClose, registerCloseGuard } from '@/services/closeGuards';
import { resetAll } from './helpers';

const w = () => useWindows.getState();

describe('window store', () => {
  beforeEach(async () => {
    await resetAll();
    w().setWorkArea({ w: 1200, h: 700 });
  });

  it('opens an application window and focuses it', () => {
    const id = w().openApp('notes')!;
    expect(w().windows[id].appId).toBe('notes');
    expect(w().focusedId).toBe(id);
    expect(w().order).toEqual([id]);
  });

  it('returns null for unknown applications', () => {
    expect(w().openApp('nope')).toBeNull();
    expect(Object.keys(w().windows)).toHaveLength(0);
  });

  it('allows several windows of a multi-instance app and cascades them', () => {
    const a = w().openApp('files')!;
    const b = w().openApp('files')!;
    expect(a).not.toBe(b);
    expect(w().windows[a].x).not.toBe(w().windows[b].x);
  });

  it('focuses the existing window of a singleton app instead of opening another', () => {
    const a = w().openApp('settings')!;
    w().openApp('files');
    const again = w().openApp('settings', { props: { section: 'dock' } })!;
    expect(again).toBe(a);
    expect(Object.values(w().windows).filter((x) => x.appId === 'settings')).toHaveLength(1);
    expect(w().focusedId).toBe(a);
    expect(w().windows[a].props.section).toBe('dock');
  });

  it('restores a minimized singleton when it is opened again', () => {
    const a = w().openApp('notes')!;
    w().minimize(a);
    expect(w().windows[a].minimized).toBe(true);
    w().openApp('notes');
    expect(w().windows[a].minimized).toBe(false);
  });

  it('brings a clicked window to the front (topmost z-order)', () => {
    const a = w().openApp('files')!;
    const b = w().openApp('files')!;
    expect(w().order[w().order.length - 1]).toBe(b);
    w().focus(a);
    expect(w().order[w().order.length - 1]).toBe(a);
    expect(w().focusedId).toBe(a);
  });

  it('minimizing the focused window focuses the next visible one', () => {
    const a = w().openApp('files')!;
    const b = w().openApp('notes')!;
    w().minimize(b);
    expect(w().focusedId).toBe(a);
    w().minimize(a);
    expect(w().focusedId).toBeNull();
  });

  it('focusing a minimized window restores it', () => {
    const a = w().openApp('files')!;
    w().minimize(a);
    w().focus(a);
    expect(w().windows[a].minimized).toBe(false);
    expect(w().focusedId).toBe(a);
  });

  it('maximizes and restores to the previous bounds', () => {
    const a = w().openApp('files')!;
    const before = { x: w().windows[a].x, y: w().windows[a].y, w: w().windows[a].w, h: w().windows[a].h };
    w().toggleMaximize(a);
    expect(w().windows[a].maximized).toBe(true);
    w().toggleMaximize(a);
    expect(w().windows[a].maximized).toBe(false);
    expect({ x: w().windows[a].x, y: w().windows[a].y, w: w().windows[a].w, h: w().windows[a].h }).toEqual(before);
  });

  it('does not maximize apps that opt out (calculator)', () => {
    const a = w().openApp('calculator')!;
    w().toggleMaximize(a);
    expect(w().windows[a].maximized).toBe(false);
  });

  it('closing removes the window and focuses the next one', () => {
    const a = w().openApp('files')!;
    const b = w().openApp('notes')!;
    w().close(b);
    expect(w().windows[b]).toBeUndefined();
    expect(w().focusedId).toBe(a);
    expect(w().order).toEqual([a]);
  });

  it('enforces minimum window sizes', () => {
    const a = w().openApp('files')!;
    w().setBounds(a, { w: 50, h: 50 });
    expect(w().windows[a].w).toBeGreaterThanOrEqual(520);
    expect(w().windows[a].h).toBeGreaterThanOrEqual(360);
  });

  it('keeps windows reachable: the title bar can never leave the workspace', () => {
    const a = w().openApp('files')!;
    w().setBounds(a, { x: 99999, y: 99999 });
    const win = w().windows[a];
    expect(win.x).toBeLessThan(1200);
    expect(win.y).toBeLessThanOrEqual(700 - 38);
    w().setBounds(a, { x: -99999, y: -50 });
    expect(w().windows[a].x + w().windows[a].w).toBeGreaterThan(0);
    expect(w().windows[a].y).toBe(0);
  });

  it('re-clamps windows when the workspace shrinks', () => {
    const a = w().openApp('files')!;
    w().setBounds(a, { x: 600, y: 300 });
    w().setWorkArea({ w: 700, h: 450 });
    const win = w().windows[a];
    expect(win.x).toBeLessThan(700);
    expect(win.y).toBeLessThanOrEqual(450 - 38);
  });

  it('manual moves un-maximize a window', () => {
    const a = w().openApp('files')!;
    w().toggleMaximize(a);
    w().setBounds(a, { x: 40, y: 40 });
    expect(w().windows[a].maximized).toBe(false);
  });

  it('snaps to the left and right half of the workspace', () => {
    const a = w().openApp('files')!;
    w().snap(a, 'left');
    expect(w().windows[a]).toMatchObject({ x: 0, y: 0, w: 600, h: 700 });
    w().snap(a, 'right');
    expect(w().windows[a]).toMatchObject({ x: 600, w: 600 });
  });

  it('cycles focus through windows in both directions', () => {
    const a = w().openApp('files')!;
    const b = w().openApp('notes')!;
    const c = w().openApp('terminal')!;
    expect(w().focusedId).toBe(c);
    w().cycle(1);
    expect(w().focusedId).toBe(a);
    w().cycle(-1);
    expect(w().focusedId).toBe(c);
    w().cycle(-1);
    expect(w().focusedId).toBe(b);
  });

  it('show-desktop minimizes everything, then restores everything', () => {
    const a = w().openApp('files')!;
    const b = w().openApp('notes')!;
    w().toggleShowDesktop();
    expect(w().windows[a].minimized && w().windows[b].minimized).toBe(true);
    expect(w().focusedId).toBeNull();
    w().toggleShowDesktop();
    expect(w().windows[a].minimized || w().windows[b].minimized).toBe(false);
    expect(w().focusedId).toBe(b);
  });

  it('persists open windows to localStorage for restoration after refresh', () => {
    const a = w().openApp('files')!;
    const saved = JSON.parse(localStorage.getItem('solace.workspace.v1')!);
    expect(saved.state.windows[a].appId).toBe('files');
  });

  it('clampBounds respects a tiny workspace', () => {
    const b = clampBounds({ x: 500, y: 500, w: 800, h: 600 }, { w: 400, h: 300 }, { w: 300, h: 200 });
    expect(b.w).toBeLessThanOrEqual(800);
    expect(b.y).toBeLessThanOrEqual(300 - 38);
  });
});

describe('close guards', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('closes immediately when no guard is registered', async () => {
    const id = useWindows.getState().openApp('files')!;
    expect(await requestClose(id)).toBe(true);
    expect(useWindows.getState().windows[id]).toBeUndefined();
  });

  it('keeps the window open when the guard vetoes', async () => {
    const id = useWindows.getState().openApp('files')!;
    const off = registerCloseGuard(id, () => false);
    expect(await requestClose(id)).toBe(false);
    expect(useWindows.getState().windows[id]).toBeDefined();
    off();
    expect(await requestClose(id)).toBe(true);
  });

  it('treats a throwing guard as a veto rather than losing work', async () => {
    const id = useWindows.getState().openApp('files')!;
    registerCloseGuard(id, async () => {
      throw new Error('boom');
    });
    expect(await requestClose(id)).toBe(false);
    expect(useWindows.getState().windows[id]).toBeDefined();
  });
});
