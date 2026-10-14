import { memo, useRef } from 'react';
import { X } from 'lucide-react';
import { useWidgets, WIDGET_META, type WidgetInstance } from '@/stores/widgetStore';
import { useWindows } from '@/stores/windowStore';
import { useSettings } from '@/stores/settingsStore';
import { clamp } from '@/utils/format';
import { CalendarWidget, ClockWidget, NotesWidget, QuickLaunchWidget, TasksWidget, TimerWidget } from './WidgetBodies';

function Body({ widget }: { widget: WidgetInstance }) {
  switch (widget.type) {
    case 'clock':
      return <ClockWidget />;
    case 'calendar':
      return <CalendarWidget />;
    case 'notes':
      return <NotesWidget />;
    case 'tasks':
      return <TasksWidget />;
    case 'timer':
      return <TimerWidget widget={widget} />;
    case 'quicklaunch':
      return <QuickLaunchWidget />;
  }
}

const Widget = memo(function Widget({ widget, index }: { widget: WidgetInstance; index: number }) {
  const meta = WIDGET_META[widget.type];
  const ref = useRef<HTMLDivElement>(null);
  const { update, remove, bringToFront } = useWidgets.getState();

  const gesture = (mode: 'move' | 'resize') => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront(widget.id);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const area = useWindows.getState().workArea;
    const o = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };
    const sx = e.clientX;
    const sy = e.clientY;
    let next = o;
    const node = ref.current!;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      next =
        mode === 'move'
          ? { ...o, x: clamp(o.x + dx, 0, Math.max(0, area.w - 60)), y: clamp(o.y + dy, 0, Math.max(0, area.h - 40)) }
          : { ...o, w: Math.max(meta.min.w, o.w + dx), h: Math.max(meta.min.h, o.h + dy) };
      node.style.transform = `translate3d(${next.x}px,${next.y}px,0)`;
      node.style.width = `${next.w}px`;
      node.style.height = `${next.h}px`;
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      update(widget.id, next);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  return (
    <section
      ref={ref}
      aria-label={`${meta.label} widget`}
      data-widget={widget.type}
      className="group pointer-events-auto absolute top-0 left-0 overflow-hidden rounded-[var(--s-radius)] border border-line bg-surface"
      style={{ transform: `translate3d(${widget.x}px,${widget.y}px,0)`, width: widget.w, height: widget.h, zIndex: index, background: 'color-mix(in srgb, var(--s-surface) 88%, transparent)', backdropFilter: 'blur(10px)' }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (e.altKey && d) {
          e.preventDefault();
          update(widget.id, { x: Math.max(0, widget.x + d[0]), y: Math.max(0, widget.y + d[1]) });
        }
      }}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex h-5 cursor-grab items-center justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 active:cursor-grabbing" onPointerDown={gesture('move')} style={{ touchAction: 'none' }} title="Drag to move">
        <button className="s-icon-btn !h-5 !w-5" aria-label={`Remove ${meta.label} widget`} title="Remove widget" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(widget.id)}>
          <X size={12} />
        </button>
      </div>
      <Body widget={widget} />
      {meta.resizable && <div className="absolute right-0 bottom-0 h-3.5 w-3.5 cursor-nwse-resize opacity-0 group-hover:opacity-100" style={{ touchAction: 'none' }} onPointerDown={gesture('resize')} aria-hidden />}
    </section>
  );
});

/** Widgets live above the wallpaper and below every window, so they can never block an app. */
export function WidgetLayer() {
  const widgets = useWidgets((s) => s.widgets);
  const visible = useSettings((s) => s.settings.widgetsVisible);
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]" aria-label="Desktop widgets">
      {widgets.map((w, i) => (
        <Widget key={w.id} widget={w} index={i} />
      ))}
    </div>
  );
}
