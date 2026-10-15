import { useNotes, type Note } from '@/stores/notesStore';
import { useTasks, type Task } from '@/stores/tasksStore';
import { useEvents, type CalendarEvent } from '@/stores/eventsStore';
import { stableStringify, type PlanOps } from './plan';

/** Everything the engine needs to know to sync one kind of record. */
export interface SyncKind<T> {
  key: 'notes' | 'tasks' | 'events';
  path: string;
  items: () => T[];
  replace: (items: T[]) => void;
  subscribe: (fn: () => void) => () => void;
  toWire: (item: T, now: number) => Record<string, unknown>;
  fromWire: (wire: Record<string, unknown>) => T;
  ops: PlanOps<T>;
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export const notesKind: SyncKind<Note> = {
  key: 'notes',
  path: '/notes',
  items: () => useNotes.getState().notes,
  replace: (notes) => useNotes.getState().replaceAll(notes),
  subscribe: (fn) => useNotes.subscribe((s, p) => s.notes !== p.notes && fn()),
  toWire: (n) => ({ title: n.title, content: n.content, pinned: n.pinned, archived: n.archived, createdAt: n.createdAt, updatedAt: n.updatedAt }),
  fromWire: (w) => ({ id: str(w.id), title: str(w.title), content: str(w.content), pinned: w.pinned === true, archived: w.archived === true, createdAt: num(w.createdAt), updatedAt: num(w.updatedAt) }),
  ops: { id: (n) => n.id, sig: (n) => stableStringify(n), modified: (n) => n.updatedAt },
};

export const tasksKind: SyncKind<Task> = {
  key: 'tasks',
  path: '/tasks',
  items: () => useTasks.getState().tasks,
  replace: (tasks) => useTasks.getState().replaceAll(tasks),
  subscribe: (fn) => useTasks.subscribe((s, p) => s.tasks !== p.tasks && fn()),
  toWire: (t, now) => ({ title: t.title, details: t.details, due: t.due, priority: t.priority, done: t.done, createdAt: t.createdAt, completedAt: t.completedAt, updatedAt: now }),
  fromWire: (w) => ({
    id: str(w.id),
    title: str(w.title),
    details: str(w.details),
    due: typeof w.due === 'string' ? w.due : null,
    priority: w.priority === 'high' || w.priority === 'low' ? w.priority : 'medium',
    done: w.done === true,
    createdAt: num(w.createdAt),
    completedAt: typeof w.completedAt === 'number' ? w.completedAt : null,
  }),
  ops: { id: (t) => t.id, sig: (t) => stableStringify(t) },
};

export const eventsKind: SyncKind<CalendarEvent> = {
  key: 'events',
  path: '/events',
  items: () => useEvents.getState().events,
  replace: (events) => useEvents.getState().replaceAll(events),
  subscribe: (fn) => useEvents.subscribe((s, p) => s.events !== p.events && fn()),
  toWire: (e, now) => ({ title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, description: e.description, updatedAt: now }),
  fromWire: (w) => ({ id: str(w.id), title: str(w.title), start: num(w.start), end: num(w.end), allDay: w.allDay === true, location: str(w.location), description: str(w.description) }),
  ops: { id: (e) => e.id, sig: (e) => stableStringify(e) },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SYNC_KINDS: Array<SyncKind<any>> = [notesKind, tasksKind, eventsKind];
