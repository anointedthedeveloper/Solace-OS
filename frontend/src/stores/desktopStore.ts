import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getApp, APPS } from '@/applications/registry';

export interface DesktopIcon {
  appId: string;
  col: number;
  row: number;
}

interface DesktopStore {
  icons: DesktopIcon[];
  add: (appId: string, rows: number) => void;
  remove: (appId: string) => void;
  moveTo: (appId: string, col: number, row: number) => void;
  reset: (rows: number) => void;
}

function defaults(rows: number): DesktopIcon[] {
  return APPS.filter((a) => a.desktopShortcut).map((a, i) => ({
    appId: a.id,
    col: Math.floor(i / rows),
    row: i % rows,
  }));
}

function firstFree(icons: DesktopIcon[], rows: number): { col: number; row: number } {
  for (let col = 0; col < 64; col++)
    for (let row = 0; row < rows; row++) if (!icons.some((i) => i.col === col && i.row === row)) return { col, row };
  return { col: 0, row: 0 };
}

export const useDesktop = create<DesktopStore>()(
  persist(
    (set) => ({
      icons: defaults(6),
      add: (appId, rows) =>
        set((s) => (s.icons.some((i) => i.appId === appId) || !getApp(appId) ? s : { icons: [...s.icons, { appId, ...firstFree(s.icons, rows) }] })),
      remove: (appId) => set((s) => ({ icons: s.icons.filter((i) => i.appId !== appId) })),
      moveTo: (appId, col, row) =>
        set((s) => {
          const occupant = s.icons.find((i) => i.col === col && i.row === row && i.appId !== appId);
          const me = s.icons.find((i) => i.appId === appId);
          if (!me) return s;
          return {
            icons: s.icons.map((i) => {
              if (i.appId === appId) return { ...i, col, row };
              // Swap with whatever was in the target cell.
              if (occupant && i.appId === occupant.appId) return { ...i, col: me.col, row: me.row };
              return i;
            }),
          };
        }),
      reset: (rows) => set({ icons: defaults(rows) }),
    }),
    {
      name: 'solace.desktop.v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const icons = ((persisted as { icons?: DesktopIcon[] } | undefined)?.icons ?? current.icons).filter((i) => getApp(i.appId));
        return { ...current, icons };
      },
    },
  ),
);
