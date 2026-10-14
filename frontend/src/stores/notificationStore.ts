import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { uid } from '@/utils/id';
import { useSettings } from './settingsStore';

export interface SolaceNotification {
  id: string;
  title: string;
  body?: string;
  time: number;
  read: boolean;
  appId?: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

interface NotificationStore {
  items: SolaceNotification[];
  /** Transient toasts (not persisted). */
  toasts: SolaceNotification[];
  push: (n: Pick<SolaceNotification, 'title'> & Partial<Omit<SolaceNotification, 'id' | 'time' | 'read'>>) => void;
  dismissToast: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotifications = create<NotificationStore>()(
  persist(
    (set) => ({
      items: [],
      toasts: [],
      push: (n) => {
        const { enabled, doNotDisturb } = useSettings.getState().settings.notifications;
        if (!enabled) return;
        const item: SolaceNotification = { id: uid('n'), time: Date.now(), read: false, level: 'info', ...n };
        set((s) => ({
          items: [item, ...s.items].slice(0, 100),
          toasts: doNotDisturb ? s.toasts : [item, ...s.toasts].slice(0, 3),
        }));
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'solace.notifications.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export const notify = (n: Parameters<NotificationStore['push']>[0]) => useNotifications.getState().push(n);
