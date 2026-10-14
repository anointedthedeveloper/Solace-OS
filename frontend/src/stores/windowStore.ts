import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Bounds, WindowState } from '@/types/windows';
import { clamp } from '@/utils/format';
import { uid } from '@/utils/id';
import { getApp } from '@/applications/registry';

export const TITLEBAR_H = 38;
const KEEP_VISIBLE = 96; // px of a window that must stay reachable on the horizontal axis

export interface WorkArea {
  w: number;
  h: number;
}

interface WindowStore {
  windows: Record<string, WindowState>;
  /** Stacking order, back → front. The last entry is the topmost window. */
  order: string[];
  focusedId: string | null;
  workArea: WorkArea;
  openApp: (appId: string, opts?: { props?: Record<string, unknown>; title?: string }) => string | null;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  snap: (id: string, side: 'left' | 'right') => void;
  setBounds: (id: string, b: Partial<Bounds>) => void;
  setTitle: (id: string, title: string) => void;
  toggleShowDesktop: () => void;
  cycle: (dir: 1 | -1) => void;
  setWorkArea: (a: WorkArea) => void;
  closeAll: () => void;
}

export function clampBounds(b: Bounds, area: WorkArea, min: { w: number; h: number }): Bounds {
  const w = clamp(b.w, Math.min(min.w, area.w), Math.max(min.w, area.w));
  const h = clamp(b.h, Math.min(min.h, area.h), Math.max(min.h, area.h));
  const x = clamp(b.x, KEEP_VISIBLE - w, Math.max(KEEP_VISIBLE - w, area.w - KEEP_VISIBLE));
  const y = clamp(b.y, 0, Math.max(0, area.h - TITLEBAR_H));
  return { x, y, w, h };
}

function topVisible(order: string[], windows: Record<string, WindowState>): string | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const w = windows[order[i]];
    if (w && !w.minimized) return w.id;
  }
  return null;
}

/** Cascade new windows 28px down-right of the most recent one so older title bars stay reachable,
 *  wrapping back to the centre when the cascade would run off the workspace. */
function nextPosition(windows: Record<string, WindowState>, size: { w: number; h: number }, area: WorkArea): Bounds {
  const step = 28;
  const centred = { x: Math.max(8, Math.round((area.w - size.w) / 2) - 40), y: Math.max(8, Math.round((area.h - size.h) / 2) - 30) };
  const all = Object.values(windows);
  const last = all[all.length - 1];
  if (last && !last.maximized) {
    const x = last.x + step;
    const y = last.y + step;
    if (x + size.w <= area.w - 8 && y + size.h <= area.h - 8) return { x, y, ...size };
  }
  return { ...centred, ...size };
}

export const useWindows = create<WindowStore>()(
  persist(
    (set, get) => ({
      windows: {},
      order: [],
      focusedId: null,
      workArea: { w: 1280, h: 720 },

      openApp: (appId, opts = {}) => {
        const app = getApp(appId);
        if (!app) return null;
        const { windows, workArea } = get();
        if (app.singleton) {
          const existing = Object.values(windows).find((w) => w.appId === appId);
          if (existing) {
            set((s) => ({
              windows: {
                ...s.windows,
                [existing.id]: { ...existing, minimized: false, props: opts.props ? { ...existing.props, ...opts.props } : existing.props },
              },
              order: [...s.order.filter((i) => i !== existing.id), existing.id],
              focusedId: existing.id,
            }));
            return existing.id;
          }
        }
        const id = uid('win');
        const size = {
          w: Math.min(app.defaultSize.w, Math.max(app.minSize.w, workArea.w - 24)),
          h: Math.min(app.defaultSize.h, Math.max(app.minSize.h, workArea.h - 24)),
        };
        const bounds = clampBounds(nextPosition(windows, size, workArea), workArea, app.minSize);
        const win: WindowState = {
          id,
          appId,
          title: opts.title ?? app.name,
          ...bounds,
          minimized: false,
          maximized: false,
          restore: null,
          props: opts.props ?? {},
        };
        set((s) => ({ windows: { ...s.windows, [id]: win }, order: [...s.order, id], focusedId: id }));
        return id;
      },

      close: (id) =>
        set((s) => {
          if (!s.windows[id]) return s;
          const { [id]: _removed, ...rest } = s.windows;
          void _removed;
          const order = s.order.filter((i) => i !== id);
          return { windows: rest, order, focusedId: s.focusedId === id ? topVisible(order, rest) : s.focusedId };
        }),

      focus: (id) =>
        set((s) => {
          const w = s.windows[id];
          if (!w) return s;
          if (s.focusedId === id && !w.minimized && s.order[s.order.length - 1] === id) return s;
          return {
            windows: w.minimized ? { ...s.windows, [id]: { ...w, minimized: false } } : s.windows,
            order: [...s.order.filter((i) => i !== id), id],
            focusedId: id,
          };
        }),

      minimize: (id) =>
        set((s) => {
          const w = s.windows[id];
          if (!w || w.minimized) return s;
          const windows = { ...s.windows, [id]: { ...w, minimized: true } };
          return { windows, focusedId: s.focusedId === id ? topVisible(s.order, windows) : s.focusedId };
        }),

      restoreWindow: (id) => get().focus(id),

      toggleMaximize: (id) =>
        set((s) => {
          const w = s.windows[id];
          const app = w && getApp(w.appId);
          if (!w || !app || app.maximizable === false) return s;
          const next: WindowState = w.maximized
            ? { ...w, maximized: false, ...(w.restore ?? {}), restore: null }
            : { ...w, maximized: true, restore: { x: w.x, y: w.y, w: w.w, h: w.h } };
          return { windows: { ...s.windows, [id]: next } };
        }),

      snap: (id, side) =>
        set((s) => {
          const w = s.windows[id];
          const app = w && getApp(w.appId);
          if (!w || !app || app.resizable === false) return s;
          const half = Math.max(app.minSize.w, Math.floor(s.workArea.w / 2));
          const restore = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
          return {
            windows: {
              ...s.windows,
              [id]: { ...w, maximized: false, restore, x: side === 'left' ? 0 : s.workArea.w - half, y: 0, w: half, h: s.workArea.h },
            },
          };
        }),

      setBounds: (id, b) =>
        set((s) => {
          const w = s.windows[id];
          const app = w && getApp(w.appId);
          if (!w || !app) return s;
          const merged = clampBounds({ x: w.x, y: w.y, w: w.w, h: w.h, ...b }, s.workArea, app.minSize);
          // A manual move/resize ends any snapped / maximized state.
          return { windows: { ...s.windows, [id]: { ...w, ...merged, maximized: false, restore: null } } };
        }),

      setTitle: (id, title) =>
        set((s) => (s.windows[id] && s.windows[id].title !== title ? { windows: { ...s.windows, [id]: { ...s.windows[id], title } } } : s)),

      toggleShowDesktop: () =>
        set((s) => {
          const all = Object.values(s.windows);
          const anyVisible = all.some((w) => !w.minimized);
          const windows: Record<string, WindowState> = {};
          for (const w of all) windows[w.id] = { ...w, minimized: anyVisible };
          return { windows, focusedId: anyVisible ? null : topVisible(s.order, windows) };
        }),

      cycle: (dir) => {
        const { order, windows, focusedId } = get();
        const ids = order.filter((i) => windows[i]);
        if (ids.length < 2) return;
        // Cycle by stable opening order so repeated presses visit every window.
        const stable = Object.keys(windows);
        const idx = Math.max(0, stable.indexOf(focusedId ?? stable[0]));
        get().focus(stable[(idx + dir + stable.length) % stable.length]);
      },

      setWorkArea: (area) =>
        set((s) => {
          if (area.w === s.workArea.w && area.h === s.workArea.h) return s;
          const windows: Record<string, WindowState> = {};
          for (const w of Object.values(s.windows)) {
            const app = getApp(w.appId);
            const b = app ? clampBounds({ x: w.x, y: w.y, w: w.w, h: w.h }, area, app.minSize) : w;
            windows[w.id] = { ...w, ...b };
          }
          return { workArea: area, windows };
        }),

      closeAll: () => set({ windows: {}, order: [], focusedId: null }),
    }),
    {
      name: 'solace.workspace.v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ windows: s.windows, order: s.order, focusedId: s.focusedId }),
      // Drop windows whose app no longer exists (e.g. after an upgrade).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<WindowStore, 'windows' | 'order' | 'focusedId'>>;
        const windows: Record<string, WindowState> = {};
        for (const [id, w] of Object.entries(p.windows ?? {})) if (getApp(w.appId)) windows[id] = w;
        const order = (p.order ?? []).filter((i) => windows[i]);
        return { ...current, windows, order, focusedId: p.focusedId && windows[p.focusedId] ? p.focusedId : topVisible(order, windows) };
      },
    },
  ),
);

/** Z-index for a window: stacking is derived from its position in `order`. */
export const BASE_Z = 10;
export const zFor = (order: string[], id: string): number => BASE_Z + order.indexOf(id);
