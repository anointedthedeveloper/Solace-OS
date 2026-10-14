import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStateStorage } from '@/services/zustandIdb';
import { uid } from '@/utils/id';

export interface SolaceDoc {
  id: string;
  name: string;
  /** Working draft — always persisted so a refresh never loses typing. */
  content: string;
  /** Last explicitly saved (or autosaved) content. */
  savedContent: string;
  createdAt: number;
  updatedAt: number;
  /** True until the document has been saved once. */
  untitled: boolean;
  /** If set, saves are also written to this file in Solace Files. */
  fileId?: string;
}

interface DocsStore {
  docs: SolaceDoc[];
  openIds: string[];
  activeId: string | null;
  create: (init?: { name?: string; content?: string; fileId?: string }) => string;
  edit: (id: string, content: string) => void;
  save: (id: string) => void;
  rename: (id: string, name: string) => void;
  /** Close the tab only; the document stays in Solace storage. */
  closeTab: (id: string) => void;
  openTab: (id: string) => void;
  discardDraft: (id: string) => void;
  remove: (id: string) => void;
}

export const isDirty = (d: SolaceDoc) => d.content !== d.savedContent;

export const useDocs = create<DocsStore>()(
  persist(
    (set) => ({
      docs: [],
      openIds: [],
      activeId: null,
      create: (init = {}) => {
        const now = Date.now();
        const id = uid('doc');
        const content = init.content ?? '';
        const doc: SolaceDoc = {
          id,
          name: init.name ?? 'Untitled.txt',
          content,
          // Imported content counts as saved; a blank new document is clean too.
          savedContent: content,
          createdAt: now,
          updatedAt: now,
          untitled: !init.name,
          ...(init.fileId ? { fileId: init.fileId } : {}),
        };
        set((s) => ({ docs: [doc, ...s.docs], openIds: [...s.openIds, id], activeId: id }));
        return id;
      },
      edit: (id, content) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, content, updatedAt: Date.now() } : d)) })),
      save: (id) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, savedContent: d.content, untitled: false } : d)) })),
      rename: (id, name) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, name: name.trim() || d.name, untitled: false } : d)) })),
      closeTab: (id) =>
        set((s) => {
          const idx = s.openIds.indexOf(id);
          const openIds = s.openIds.filter((i) => i !== id);
          const activeId = s.activeId === id ? (openIds[Math.min(idx, openIds.length - 1)] ?? null) : s.activeId;
          return { openIds, activeId };
        }),
      openTab: (id) =>
        set((s) => (s.docs.some((d) => d.id === id) ? { openIds: s.openIds.includes(id) ? s.openIds : [...s.openIds, id], activeId: id } : s)),
      discardDraft: (id) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, content: d.savedContent } : d)) })),
      remove: (id) =>
        set((s) => {
          const openIds = s.openIds.filter((i) => i !== id);
          return { docs: s.docs.filter((d) => d.id !== id), openIds, activeId: s.activeId === id ? (openIds[0] ?? null) : s.activeId };
        }),
    }),
    {
      name: 'solace.docs.v1',
      storage: createJSONStorage(() => idbStateStorage),
      partialize: (s) => ({ docs: s.docs, openIds: s.openIds, activeId: s.activeId }),
    },
  ),
);
