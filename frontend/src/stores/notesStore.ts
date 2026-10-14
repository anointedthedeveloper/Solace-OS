import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStateStorage } from '@/services/zustandIdb';
import { uid } from '@/utils/id';

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
}

interface NotesStore {
  notes: Note[];
  create: (init?: Partial<Pick<Note, 'title' | 'content'>>) => string;
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => void;
  togglePin: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  remove: (id: string) => void;
  replaceAll: (notes: Note[]) => void;
}

export const useNotes = create<NotesStore>()(
  persist(
    (set) => ({
      notes: [],
      create: (init = {}) => {
        const now = Date.now();
        const note: Note = { id: uid('note'), title: '', content: '', ...init, createdAt: now, updatedAt: now, pinned: false, archived: false };
        set((s) => ({ notes: [note, ...s.notes] }));
        return note.id;
      },
      update: (id, patch) =>
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) })),
      togglePin: (id) => set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)) })),
      setArchived: (id, archived) => set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, archived, pinned: archived ? false : n.pinned } : n)) })),
      remove: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      replaceAll: (notes) => set({ notes }),
    }),
    { name: 'solace.notes.v1', storage: createJSONStorage(() => idbStateStorage), partialize: (s) => ({ notes: s.notes }) },
  ),
);
