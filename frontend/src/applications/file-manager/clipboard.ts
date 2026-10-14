import { create } from 'zustand';

/** In-app clipboard for Solace Files copy / cut / paste. */
interface Clip {
  mode: 'copy' | 'cut' | null;
  ids: string[];
  set: (mode: 'copy' | 'cut', ids: string[]) => void;
  clear: () => void;
}
export const useFileClipboard = create<Clip>((set) => ({ mode: null, ids: [], set: (mode, ids) => set({ mode, ids }), clear: () => set({ mode: null, ids: [] }) }));
