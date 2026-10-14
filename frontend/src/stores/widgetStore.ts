import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { uid } from '@/utils/id';

export type WidgetType = 'clock' | 'calendar' | 'notes' | 'tasks' | 'timer' | 'quicklaunch';

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  description: string;
  size: { w: number; h: number };
  min: { w: number; h: number };
  resizable: boolean;
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  clock: { type: 'clock', label: 'Clock', description: 'Digital clock with the date', size: { w: 220, h: 110 }, min: { w: 180, h: 90 }, resizable: true },
  calendar: { type: 'calendar', label: 'Calendar', description: "This month and today's events", size: { w: 260, h: 270 }, min: { w: 230, h: 240 }, resizable: false },
  notes: { type: 'notes', label: 'Notes preview', description: 'Your pinned and latest notes', size: { w: 260, h: 190 }, min: { w: 200, h: 140 }, resizable: true },
  tasks: { type: 'tasks', label: 'Task overview', description: 'Open tasks at a glance', size: { w: 260, h: 190 }, min: { w: 200, h: 140 }, resizable: true },
  timer: { type: 'timer', label: 'Timer', description: 'A simple countdown timer', size: { w: 220, h: 150 }, min: { w: 200, h: 140 }, resizable: false },
  quicklaunch: { type: 'quicklaunch', label: 'Quick launch', description: 'Shortcuts to your favourite apps', size: { w: 240, h: 120 }, min: { w: 200, h: 100 }, resizable: true },
};

interface WidgetStore {
  widgets: WidgetInstance[];
  add: (type: WidgetType, at?: { x: number; y: number }) => string;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Pick<WidgetInstance, 'x' | 'y' | 'w' | 'h'>>) => void;
  setConfig: (id: string, config: Record<string, unknown>) => void;
  bringToFront: (id: string) => void;
  clear: () => void;
}

export const useWidgets = create<WidgetStore>()(
  persist(
    (set, get) => ({
      widgets: [],
      add: (type, at) => {
        const meta = WIDGET_META[type];
        const n = get().widgets.length;
        const id = uid('wg');
        const w: WidgetInstance = {
          id,
          type,
          x: at?.x ?? 40 + (n % 5) * 24,
          y: at?.y ?? 40 + (n % 5) * 24,
          w: meta.size.w,
          h: meta.size.h,
          config: {},
        };
        set((s) => ({ widgets: [...s.widgets, w] }));
        return id;
      },
      remove: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
      update: (id, patch) => set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      setConfig: (id, config) => set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...config } } : w)) })),
      bringToFront: (id) =>
        set((s) => {
          const w = s.widgets.find((x) => x.id === id);
          return !w || s.widgets[s.widgets.length - 1]?.id === id ? s : { widgets: [...s.widgets.filter((x) => x.id !== id), w] };
        }),
      clear: () => set({ widgets: [] }),
    }),
    { name: 'solace.widgets.v1', storage: createJSONStorage(() => localStorage) },
  ),
);
