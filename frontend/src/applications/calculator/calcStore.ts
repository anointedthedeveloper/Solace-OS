import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CalcEntry {
  id: number;
  expr: string;
  result: string;
}

interface CalcStore {
  history: CalcEntry[];
  add: (expr: string, result: string) => void;
  clear: () => void;
}

export const useCalcHistory = create<CalcStore>()(
  persist(
    (set) => ({
      history: [],
      add: (expr, result) => set((s) => ({ history: [{ id: Date.now() + Math.random(), expr, result }, ...s.history].slice(0, 50) })),
      clear: () => set({ history: [] }),
    }),
    { name: 'solace.calculator.v1', storage: createJSONStorage(() => localStorage) },
  ),
);
