import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useWindows } from '@/stores/windowStore';
import { useUi } from '@/stores/uiStore';
import { useEvents, eventsOnDay } from '@/stores/eventsStore';
import { monthGrid } from '@/utils/calendar';
import { cn } from '@/utils/cn';
import { panelAnchor, useDockMetrics } from './dockMetrics';
import { useClockText } from './Tray';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function ClockPopover() {
  const m = useDockMetrics();
  const { time, now } = useClockText();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const events = useEvents((s) => s.events);
  const close = useUi((s) => s.closePanel);
  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  return (
    <div className="s-panel s-anim-pop fixed z-[7000] w-[min(300px,calc(100vw-24px))] p-3" style={panelAnchor(m, 'end')} role="dialog" aria-label="Date and calendar">
      <div className="text-[28px] leading-none font-light text-ink tabular-nums">{time}</div>
      <div className="mt-1 mb-3 text-[12.5px] text-dim">{now.toLocaleDateString(undefined, { dateStyle: 'full' })}</div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[13px] font-medium">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
        <div className="flex">
          <button className="s-icon-btn" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft size={15} />
          </button>
          <button className="s-icon-btn" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[12px]" role="grid" aria-label="Month">
        {DOW.map((d, i) => (
          <div key={i} className="py-1 text-faint" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const isToday = d.toDateString() === now.toDateString();
          const inMonth = d.getMonth() === cursor.getMonth();
          const has = eventsOnDay(events, d).length > 0;
          return (
            <div key={d.toISOString()} role="gridcell" aria-current={isToday ? 'date' : undefined} className={cn('relative mx-auto grid h-7 w-7 place-items-center rounded-full', isToday ? 'bg-accent font-semibold text-accentfg' : inMonth ? 'text-ink' : 'text-faint')}>
              {d.getDate()}
              {has && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent" aria-label="Has events" />}
            </div>
          );
        })}
      </div>
      <button
        className="s-btn mt-3 w-full"
        onClick={() => {
          close();
          useWindows.getState().openApp('calendar');
        }}
      >
        Open Calendar
      </button>
    </div>
  );
}
