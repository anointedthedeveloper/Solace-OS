import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useSettings } from './settingsStore';

interface LauncherStore {
  recents: string[];
  record: (appId: string) => void;
  clear: () => void;
}

export const useLauncher = create<LauncherStore>()(
  persist(
    (set) => ({
      recents: [],
      record: (appId) => {
        if (!useSettings.getState().settings.privacy.rememberRecents) return;
        set((s) => ({ recents: [appId, ...s.recents.filter((r) => r !== appId)].slice(0, 8) }));
      },
      clear: () => set({ recents: [] }),
    }),
    { name: 'solace.recents.v1', storage: createJSONStorage(() => localStorage) },
  ),
);
