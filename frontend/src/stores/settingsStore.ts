import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '@/app/constants';
import type { Settings, ShortcutId } from '@/types/settings';

type Patch<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

interface SettingsState {
  settings: Settings;
  update: (patch: Patch<Settings>) => void;
  setShortcut: (id: ShortcutId, combo: string) => void;
  completeSetup: (p: { displayName: string }) => void;
  pin: (appId: string) => void;
  unpin: (appId: string) => void;
  movePinned: (appId: string, delta: -1 | 1) => void;
  resetDefaults: () => void;
}

/** Deep-merge persisted settings over defaults so newly added keys always exist. */
export function mergeSettings(base: Settings, saved: unknown): Settings {
  if (!saved || typeof saved !== 'object') return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (!(k in base)) continue;
    const b = (base as unknown as Record<string, unknown>)[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(b as object), ...(v as object) };
    } else if (typeof v === typeof b || v === null) {
      out[k] = v;
    }
  }
  return out as unknown as Settings;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) =>
        set((s) => {
          const next: Record<string, unknown> = { ...s.settings };
          for (const [k, v] of Object.entries(patch)) {
            const cur = (s.settings as unknown as Record<string, unknown>)[k];
            next[k] =
              cur && typeof cur === 'object' && !Array.isArray(cur) && v && typeof v === 'object' && !Array.isArray(v)
                ? { ...(cur as object), ...(v as object) }
                : v;
          }
          return { settings: next as unknown as Settings };
        }),
      setShortcut: (id, combo) => set((s) => ({ settings: { ...s.settings, shortcuts: { ...s.settings.shortcuts, [id]: combo } } })),
      completeSetup: ({ displayName }) =>
        set((s) => ({ settings: { ...s.settings, setupComplete: true, displayName: displayName.trim().slice(0, 40) } })),
      pin: (appId) =>
        set((s) =>
          s.settings.dock.pinned.includes(appId)
            ? s
            : { settings: { ...s.settings, dock: { ...s.settings.dock, pinned: [...s.settings.dock.pinned, appId] } } },
        ),
      unpin: (appId) =>
        set((s) => ({
          settings: { ...s.settings, dock: { ...s.settings.dock, pinned: s.settings.dock.pinned.filter((p) => p !== appId) } },
        })),
      movePinned: (appId, delta) =>
        set((s) => {
          const list = [...s.settings.dock.pinned];
          const i = list.indexOf(appId);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= list.length) return s;
          [list[i], list[j]] = [list[j], list[i]];
          return { settings: { ...s.settings, dock: { ...s.settings.dock, pinned: list } } };
        }),
      resetDefaults: () =>
        set((s) => ({
          // Reset appearance & behaviour but keep identity and completed setup.
          settings: {
            ...DEFAULT_SETTINGS,
            shortcuts: { ...DEFAULT_SHORTCUTS },
            setupComplete: s.settings.setupComplete,
            displayName: s.settings.displayName,
          },
        })),
    }),
    {
      name: 'solace.settings.v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => ({
        ...current,
        settings: mergeSettings(current.settings, (persisted as { settings?: unknown } | undefined)?.settings),
      }),
    },
  ),
);

export const selectSettings = (s: SettingsState) => s.settings;
