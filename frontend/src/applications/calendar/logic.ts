import type { CalendarEvent, EventInput } from '@/stores/eventsStore';
import { toDateKey, fromDateKey } from '@/utils/format';

export interface EventDraft {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
}

export function draftFromEvent(e: CalendarEvent): EventDraft {
  const s = new Date(e.start);
  const en = new Date(e.end);
  const time = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { title: e.title, allDay: e.allDay, startDate: toDateKey(s), startTime: e.allDay ? '09:00' : time(s), endDate: toDateKey(en), endTime: e.allDay ? '10:00' : time(en), location: e.location, description: e.description };
}

export function defaultDraft(day: Date, hour = 9): EventDraft {
  const key = toDateKey(day);
  const h = (n: number) => `${String(Math.min(23, n)).padStart(2, '0')}:00`;
  return { title: '', allDay: false, startDate: key, startTime: h(hour), endDate: key, endTime: h(hour + 1), location: '', description: '' };
}

function combine(dateKey: string, time: string): number {
  const d = fromDateKey(dateKey);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/** Validate a draft and convert it to a storable event, or return an error message. */
export function draftToInput(d: EventDraft): { ok: true; value: EventInput } | { ok: false; error: string } {
  if (!d.title.trim()) return { ok: false, error: 'Please enter a title.' };
  if (!d.startDate || !d.endDate) return { ok: false, error: 'Please choose a date.' };
  if (!d.allDay && (!d.startTime || !d.endTime)) return { ok: false, error: 'Please choose start and end times.' };
  const start = d.allDay ? combine(d.startDate, '00:00') : combine(d.startDate, d.startTime);
  const end = d.allDay ? combine(d.endDate, '00:00') : combine(d.endDate, d.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: 'That date is not valid.' };
  if (end < start || (!d.allDay && end === start)) return { ok: false, error: 'The end must be after the start.' };
  return { ok: true, value: { title: d.title.trim(), allDay: d.allDay, start, end, location: d.location.trim(), description: d.description.trim() } };
}

export function formatEventTime(e: CalendarEvent): string {
  if (e.allDay) return 'All day';
  const f = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${f(e.start)} – ${f(e.end)}`;
}
