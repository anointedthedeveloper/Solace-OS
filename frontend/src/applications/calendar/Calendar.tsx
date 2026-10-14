import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Trash2 } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { useEvents, eventsOnDay, type CalendarEvent } from '@/stores/eventsStore';
import { confirmDialog } from '@/stores/uiStore';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { addDays, monthGrid, sameDay, startOfDay } from '@/utils/calendar';
import { cn } from '@/utils/cn';
import { defaultDraft, draftFromEvent, draftToInput, formatEventTime, type EventDraft } from './logic';

type View = 'month' | 'agenda';
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function EventForm({ event, initial, onClose }: { event: CalendarEvent | null; initial: EventDraft; onClose: () => void }) {
  const [d, setD] = useState<EventDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const save = () => {
    const r = draftToInput(d);
    if (!r.ok) return setError(r.error);
    if (event) useEvents.getState().update(event.id, r.value);
    else useEvents.getState().add(r.value);
    onClose();
  };
  const remove = async () => {
    if (!event) return;
    if (await confirmDialog({ title: 'Delete event?', message: `“${event.title}” will be permanently deleted.`, confirmLabel: 'Delete', danger: true })) {
      useEvents.getState().remove(event.id);
      onClose();
    }
  };

  return (
    <Modal
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      width={480}
      footer={
        <>
          {event && (
            <button className="s-btn s-btn-danger mr-auto" onClick={() => void remove()}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button className="s-btn" onClick={onClose}>Cancel</button>
          <button className="s-btn s-btn-primary" onClick={save}>Save</button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div>
          <label className="mb-1 block text-[12.5px]" htmlFor="ev-title">Title</label>
          <input id="ev-title" data-autofocus className="s-input w-full" maxLength={200} value={d.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" className="accent-[var(--s-accent)]" checked={d.allDay} onChange={(e) => set('allDay', e.target.checked)} /> All day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12.5px]" htmlFor="ev-sd">Start date</label>
            <input id="ev-sd" type="date" className="s-input w-full" value={d.startDate} onChange={(e) => { set('startDate', e.target.value); if (d.endDate < e.target.value) set('endDate', e.target.value); }} />
          </div>
          {!d.allDay && (
            <div>
              <label className="mb-1 block text-[12.5px]" htmlFor="ev-st">Start time</label>
              <input id="ev-st" type="time" className="s-input w-full" value={d.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[12.5px]" htmlFor="ev-ed">End date</label>
            <input id="ev-ed" type="date" className="s-input w-full" value={d.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </div>
          {!d.allDay && (
            <div>
              <label className="mb-1 block text-[12.5px]" htmlFor="ev-et">End time</label>
              <input id="ev-et" type="time" className="s-input w-full" value={d.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[12.5px]" htmlFor="ev-loc">Location</label>
          <input id="ev-loc" className="s-input w-full" maxLength={200} value={d.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px]" htmlFor="ev-desc">Notes</label>
          <textarea id="ev-desc" rows={3} className="s-input w-full" maxLength={2000} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div role="alert" className="min-h-4 text-[12.5px] text-danger">{error}</div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function Calendar(_props: AppComponentProps) {
  const events = useEvents((s) => s.events);
  const today = startOfDay(new Date());
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const [form, setForm] = useState<{ event: CalendarEvent | null; draft: EventDraft } | null>(null);

  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const agenda = useMemo(() => {
    const out: Array<{ day: Date; items: CalendarEvent[] }> = [];
    for (let i = 0; i < 90; i++) {
      const day = addDays(startOfDay(selected), i);
      const items = eventsOnDay(events, day);
      if (items.length) out.push({ day, items });
    }
    return out;
  }, [events, selected]);

  const shift = (n: number) => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
    else {
      const d = addDays(selected, n * 7);
      setSelected(d);
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };
  const goToday = () => {
    setSelected(today);
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  };
  const openNew = (day = selected) => setForm({ event: null, draft: defaultDraft(day) });
  const openEdit = (e: CalendarEvent) => setForm({ event: e, draft: draftFromEvent(e) });

  const title = view === 'month' ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `From ${selected.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="m-0 mr-2 min-w-[150px] text-[16px] font-semibold" aria-live="polite">{title}</h2>
        <button className="s-icon-btn" aria-label={view === 'month' ? 'Previous month' : 'Previous week'} onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <button className="s-icon-btn" aria-label={view === 'month' ? 'Next month' : 'Next week'} onClick={() => shift(1)}><ChevronRight size={16} /></button>
        <button className="s-btn" onClick={goToday}>Today</button>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<View> label="Calendar view" value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]} />
          <button className="s-btn s-btn-primary" onClick={() => openNew()}><Plus size={15} /> New event</button>
        </div>
      </header>

      {view === 'month' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-7 border-b border-line text-center text-[11.5px] text-faint" aria-hidden>
            {DOW.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6" role="grid" aria-label={title}>
            {cells.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = sameDay(d, today);
              const isSel = sameDay(d, selected);
              const items = eventsOnDay(events, d);
              return (
                <div
                  key={d.toISOString()}
                  role="gridcell"
                  aria-selected={isSel}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${d.toLocaleDateString(undefined, { dateStyle: 'full' })}${items.length ? `, ${items.length} event${items.length > 1 ? 's' : ''}` : ''}`}
                  tabIndex={isSel ? 0 : -1}
                  onClick={() => setSelected(d)}
                  onDoubleClick={() => openNew(d)}
                  onKeyDown={(e) => {
                    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
                    if (delta) {
                      e.preventDefault();
                      const n = addDays(d, delta);
                      setSelected(n);
                      if (n.getMonth() !== cursor.getMonth()) setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
                      const grid = e.currentTarget.parentElement; // read now: currentTarget is cleared after the handler
                      requestAnimationFrame(() => (grid?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus());
                    } else if (e.key === 'Enter') openNew(d);
                  }}
                  className={cn('min-h-0 overflow-hidden border-r border-b border-line p-1 outline-none focus-visible:outline-offset-[-2px]', !inMonth && 'bg-surface2/60', isSel && 'bg-accentsoft')}
                >
                  <div className="mb-0.5 flex">
                    <span className={cn('grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[12px]', isToday ? 'bg-accent font-semibold text-accentfg' : inMonth ? 'text-ink' : 'text-faint')}>{d.getDate()}</span>
                  </div>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((ev) => (
                      <button key={ev.id} className="block w-full truncate rounded-[3px] border-0 bg-accentsoft px-1.5 py-px text-left text-[11.5px] text-ink hover:brightness-125" title={`${ev.title} — ${formatEventTime(ev)}`} onClick={(e) => { e.stopPropagation(); setSelected(d); openEdit(ev); }}>
                        {!ev.allDay && <span className="text-dim">{new Date(ev.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} </span>}
                        {ev.title}
                      </button>
                    ))}
                    {items.length > 3 && <div className="px-1 text-[11px] text-dim">+{items.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {agenda.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" hint="No events in the next 90 days from this date." action={<button className="s-btn s-btn-primary" onClick={() => openNew()}>New event</button>} />
          ) : (
            agenda.map(({ day, items }) => (
              <section key={day.toISOString()} className="mb-4" aria-label={day.toDateString()}>
                <h3 className={cn('m-0 mb-1.5 text-[12.5px] font-semibold', sameDay(day, today) ? 'text-accent' : 'text-dim')}>
                  {sameDay(day, today) ? 'Today · ' : ''}
                  {day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                <ul className="m-0 list-none space-y-1 p-0">
                  {items.map((ev) => (
                    <li key={ev.id}>
                      <button className="flex w-full items-start gap-3 rounded-[var(--s-radius-sm)] border border-line bg-surface2 px-3 py-2 text-left hover:bg-surface3" onClick={() => openEdit(ev)}>
                        <span className="w-[110px] shrink-0 text-[12.5px] text-dim">{formatEventTime(ev)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-ink">{ev.title}</span>
                          {ev.location && <span className="flex items-center gap-1 truncate text-[12px] text-dim"><MapPin size={11} aria-hidden /> {ev.location}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
      <footer className="border-t border-line px-3 py-1.5 text-[11.5px] text-faint">Events are stored in this browser only — they don't sync with any online calendar.</footer>
      {form && <EventForm event={form.event} initial={form.draft} onClose={() => setForm(null)} />}
    </div>
  );
}
