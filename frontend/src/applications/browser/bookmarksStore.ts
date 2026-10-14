import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { uid } from '@/utils/id';

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}
export interface Visit {
  url: string;
  at: number;
}

interface BookmarksStore {
  bookmarks: Bookmark[];
  visits: Visit[];
  add: (title: string, url: string) => void;
  remove: (id: string) => void;
  visit: (url: string) => void;
  clearVisits: () => void;
}

export const useBookmarks = create<BookmarksStore>()(
  persist(
    (set) => ({
      bookmarks: [],
      visits: [],
      add: (title, url) => set((s) => (s.bookmarks.some((b) => b.url === url) ? s : { bookmarks: [...s.bookmarks, { id: uid('bm'), title, url }] })),
      remove: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
      visit: (url) => set((s) => ({ visits: [{ url, at: Date.now() }, ...s.visits.filter((v) => v.url !== url)].slice(0, 8) })),
      clearVisits: () => set({ visits: [] }),
    }),
    { name: 'solace.browser.v1', storage: createJSONStorage(() => localStorage) },
  ),
);
