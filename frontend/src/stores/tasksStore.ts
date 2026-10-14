import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStateStorage } from '@/services/zustandIdb';
import { uid } from '@/utils/id';

export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  details: string;
  /** yyyy-mm-dd (local) or null */
  due: string | null;
  priority: Priority;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
}

export type TaskInput = Partial<Pick<Task, 'title' | 'details' | 'due' | 'priority'>>;

interface TasksStore {
  tasks: Task[];
  add: (input: TaskInput & { title: string }) => string;
  update: (id: string, patch: TaskInput) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => number;
  replaceAll: (tasks: Task[]) => void;
}

export const useTasks = create<TasksStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      add: (input) => {
        const task: Task = {
          id: uid('task'),
          title: input.title.trim(),
          details: input.details ?? '',
          due: input.due ?? null,
          priority: input.priority ?? 'medium',
          done: false,
          createdAt: Date.now(),
          completedAt: null,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return task.id;
      },
      update: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      toggle: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t)),
        })),
      remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      clearCompleted: () => {
        const n = get().tasks.filter((t) => t.done).length;
        set((s) => ({ tasks: s.tasks.filter((t) => !t.done) }));
        return n;
      },
      replaceAll: (tasks) => set({ tasks }),
    }),
    { name: 'solace.tasks.v1', storage: createJSONStorage(() => idbStateStorage), partialize: (s) => ({ tasks: s.tasks }) },
  ),
);
