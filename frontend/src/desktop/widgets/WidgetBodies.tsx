import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { getApp } from '@/applications/registry';
import { AppIcon } from '@/components/ui/AppIcon';
import { useNow } from '@/hooks/useNow';
import { useSettings } from '@/stores/settingsStore';
import { useNotes } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents, eventsOnDay } from '@/stores/eventsStore';
import { useWindows } from '@/stores/windowStore';
import { notify } from '@/stores/notificationStore';
import { monthGrid } from '@/utils/calendar';
import { toDateKey } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { WidgetInstance } from '@/stores/widgetStore';
import { useWidgets } from '@/stores/widgetStore';

export function ClockWidget() {
  const { hour12, showSeconds } = useSettings((s) => s.settings.clock);
  const now = useNow(1000);
  return (
    <div className="flex h-full flex-col justify-center px-4" style={{ containerType: 'inline-size' }}>
      <div className="leading-none font-light text-ink tabular-nums" style={{ fontSize: 'clamp(28px, 17cqw, 64px)' }}>
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined, hour12 })}
      </div>
      <div className="mt-1.5 text-[12.5px] text-dim">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  );
}

export function CalendarWidget() {
  const now = useNow(60_000);
  const events = useEvents((s) => s.events);
  const cells = useMemo(() => monthGrid(now.getFullYear(), now.getMonth()), [now]);
  const today = eventsOnDay(events, now);
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <div className="text-[12.5px] font-medium text-ink">{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      <div className="grid grid-cols-7 text-center text-[11px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-faint">
            {d}
          </div>
        ))}
        {cells.slice(0, 42).map((d) => (
          <div key={d.toISOString()} className={cn('mx-auto grid h-[22px] w-[22px] place-items-center rounded-full', d.toDateString() === now.toDateString() ? 'bg-accent font-semibold text-accentfg' : d.getMonth() === now.getMonth() ? 'text-ink' : 'text-faint')}>
            {d.getDate()}
          </div>
        ))}
      </div>
      <div className="mt-auto truncate text-[11.5px] text-dim">{today.length ? `${today.length} event${today.length > 1 ? 's' : ''} today: ${today[0].title}` : 'No events today'}</div>
    </div>
  );
}

export function NotesWidget() {
  const notes = useNotes((s) => s.notes);
  const list = useMemo(() => notes.filter((n) => !n.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).slice(0, 4), [notes]);
  return (
    <button className="flex h-full w-full flex-col gap-1.5 overflow-hidden border-0 bg-transparent p-3 text-left" onClick={() => useWindows.getState().openApp('notes')} aria-label="Open Notes">
      <div className="s-label">Notes</div>
      {list.length === 0 ? (
        <div className="text-[12.5px] text-dim">No notes yet. Click to write one.</div>
      ) : (
        list.map((n) => (
          <div key={n.id} className="min-w-0">
            <div className="truncate text-[12.5px] text-ink">{n.title || 'Untitled note'}</div>
            <div className="truncate text-[11.5px] text-faint">{n.content.replace(/\s+/g, ' ').slice(0, 80) || 'Empty'}</div>
          </div>
        ))
      )}
    </button>
  );
}

export function TasksWidget() {
  const tasks = useTasks((s) => s.tasks);
  const toggle = useTasks((s) => s.toggle);
  const open = tasks.filter((t) => !t.done);
  const today = toDateKey(new Date());
  const overdue = open.filter((t) => t.due && t.due < today).length;
  const list = [...open].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')).slice(0, 4);
  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden p-3">
      <button className="flex items-baseline justify-between border-0 bg-transparent p-0" onClick={() => useWindows.getState().openApp('tasks')} aria-label="Open Tasks">
        <span className="s-label">Tasks</span>
        <span className="text-[11.5px] text-dim">
          {open.length} open{overdue ? <span className="text-danger"> · {overdue} overdue</span> : null}
        </span>
      </button>
      {list.length === 0 ? (
        <div className="text-[12.5px] text-dim">{tasks.length ? 'Everything is done.' : 'No tasks yet.'}</div>
      ) : (
        list.map((t) => (
          <label key={t.id} className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink">
            <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} aria-label={`Complete ${t.title}`} className="accent-[var(--s-accent)]" />
            <span className="truncate">{t.title}</span>
          </label>
        ))
      )}
    </div>
  );
}

const PRESETS = [1, 5, 10, 25];

export function TimerWidget({ widget }: { widget: WidgetInstance }) {
  const minutes = (widget.config.minutes as number | undefined) ?? 5;
  const total = minutes * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const endRef = useRef(0);
  const setConfig = useWidgets((s) => s.setConfig);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setRunning(false);
        notify({ title: 'Timer finished', body: `${minutes} minute timer is up.`, level: 'success' });
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, minutes]);

  const toggle = () => {
    if (!running) {
      const start = left === 0 ? total : left;
      endRef.current = Date.now() + start * 1000;
      setLeft(start);
    }
    setRunning(!running);
  };
  const reset = () => {
    setRunning(false);
    setLeft(total);
  };
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      <div className="text-[34px] leading-none font-light text-ink tabular-nums" role="timer" aria-label={`${mm} minutes ${ss} seconds remaining`}>
        {mm}:{ss}
      </div>
      <div className="flex items-center gap-1">
        <button className="s-icon-btn" aria-label={running ? 'Pause timer' : 'Start timer'} onClick={toggle}>
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="s-icon-btn" aria-label="Reset timer" onClick={reset}>
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="flex gap-1" role="group" aria-label="Timer length">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={cn('rounded px-1.5 py-0.5 text-[11px]', p === minutes ? 'bg-accentsoft text-ink' : 'text-dim hover:bg-surface3')}
            aria-pressed={p === minutes}
            onClick={() => {
              setConfig(widget.id, { minutes: p });
              setRunning(false);
              setLeft(p * 60);
            }}
          >
            {p}m
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuickLaunchWidget() {
  const pinned = useSettings((s) => s.settings.dock.pinned);
  return (
    <div className="flex h-full flex-wrap content-center items-center justify-center gap-2 p-3">
      {pinned.map((id) => {
        const app = getApp(id);
        return app ? (
          <button key={id} className="rounded-[var(--s-radius-sm)] p-1 hover:bg-surface3" aria-label={`Open ${app.name}`} title={app.name} onClick={() => useWindows.getState().openApp(id)}>
            <AppIcon icon={app.icon} size={36} />
          </button>
        ) : null;
      })}
    </div>
  );
}
