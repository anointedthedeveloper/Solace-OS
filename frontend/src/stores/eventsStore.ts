import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStateStorage } from '@/services/zustandIdb';
import { uid } from '@/utils/id';

export interface CalendarEvent {
  id: string;
  title: string;
  /** Start / end as epoch ms. For all-day events, start is local midnight and end is the last day's midnight. */
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  description: string;
}

export type EventInput = Omit<CalendarEvent, 'id'>;

interface EventsStore {
  events: CalendarEvent[];
  add: (e: EventInput) => string;
  update: (id: string, e: Partial<EventInput>) => void;
  remove: (id: string) => void;
  replaceAll: (events: CalendarEvent[]) => void;
}

export const useEvents = create<EventsStore>()(
  persist(
    (set) => ({
      events: [],
      add: (e) => {
        const id = uid('evt');
        set((s) => ({ events: [...s.events, { ...e, id }] }));
        return id;
      },
      update: (id, e) => set((s) => ({ events: s.events.map((x) => (x.id === id ? { ...x, ...e } : x)) })),
      remove: (id) => set((s) => ({ events: s.events.filter((x) => x.id !== id) })),
      replaceAll: (events) => set({ events }),
    }),
    { name: 'solace.events.v1', storage: createJSONStorage(() => idbStateStorage), partialize: (s) => ({ events: s.events }) },
  ),
);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Events overlapping the local calendar day containing `day`. */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const s = startOfDay(day);
  const e = s + 86_400_000;
  return events
    .filter((ev) => (ev.allDay ? startOfDay(new Date(ev.start)) < e && startOfDay(new Date(ev.end)) + 86_400_000 > s : ev.start < e && ev.end > s))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}
