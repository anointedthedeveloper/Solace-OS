import { memo, Suspense, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { getApp } from '@/applications/registry';
import { TITLEBAR_H, useWindows, zFor, clampBounds } from '@/stores/windowStore';
import { useSettings } from '@/stores/settingsStore';
import { requestClose } from '@/services/closeGuards';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/utils/cn';
import type { Bounds } from '@/types/windows';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const EDGE_CLASS: Record<Edge, string> = {
  n: 'top-[-3px] left-2 right-2 h-[6px] cursor-ns-resize',
  s: 'bottom-[-3px] left-2 right-2 h-[6px] cursor-ns-resize',
  e: 'right-[-3px] top-2 bottom-2 w-[6px] cursor-ew-resize',
  w: 'left-[-3px] top-2 bottom-2 w-[6px] cursor-ew-resize',
  ne: 'top-[-4px] right-[-4px] h-[12px] w-[12px] cursor-nesw-resize',
  nw: 'top-[-4px] left-[-4px] h-[12px] w-[12px] cursor-nwse-resize',
  se: 'bottom-[-4px] right-[-4px] h-[12px] w-[12px] cursor-nwse-resize',
  sw: 'bottom-[-4px] left-[-4px] h-[12px] w-[12px] cursor-nesw-resize',
};

/** The app body. Memoised so dragging/focus changes never re-render app content. */
const WindowContent = memo(function WindowContent({ windowId, appId, props }: { windowId: string; appId: string; props: Record<string, unknown> }) {
  const app = getApp(appId);
  if (!app) return null;
  const App = app.component;
  return (
    <ErrorBoundary label={app.name}>
      <Suspense fallback={<div className="grid h-full place-items-center text-faint">Loading…</div>}>
        <App windowId={windowId} props={props} />
      </Suspense>
    </ErrorBoundary>
  );
});

export const WindowFrame = memo(function WindowFrame({ id }: { id: string }) {
  const win = useWindows((s) => s.windows[id]);
  const z = useWindows((s) => zFor(s.order, id));
  const focused = useWindows((s) => s.focusedId === id);
  const compact = useWindows((s) => s.workArea.w < 700);
  const { focus, minimize, toggleMaximize, setBounds, snap } = useWindows(
    useShallow((s) => ({ focus: s.focus, minimize: s.minimize, toggleMaximize: s.toggleMaximize, setBounds: s.setBounds, snap: s.snap })),
  );
  const snapToEdges = useSettings((s) => s.settings.windows.snapToEdges);
  const ref = useRef<HTMLDivElement>(null);
  /** Live bounds while a gesture is running (applied straight to the DOM, committed on release). */
  const live = useRef<Bounds | null>(null);

  const app = win ? getApp(win.appId) : undefined;

  // Keep keyboard focus inside a window when it becomes active (e.g. after un-minimize).
  useEffect(() => {
    if (focused && ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
  }, [focused]);

  if (!win || !app) return null;
  const maximized = win.maximized || compact;
  const canResize = app.resizable !== false && !maximized;
  const canMaximize = app.maximizable !== false && !compact;

  const apply = (b: Bounds) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate3d(${b.x}px,${b.y}px,0)`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
  };

  /** Workspace origin (for pointer-relative maths) plus its logical size from the store. */
  const workspaceRect = () => {
    const r = ref.current?.parentElement?.getBoundingClientRect();
    const work = useWindows.getState().workArea;
    return { left: r?.left ?? 0, top: r?.top ?? 0, width: work.w, height: work.h };
  };

  const startDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button') || compact) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const area = workspaceRect();
    let origin: Bounds = { x: win.x, y: win.y, w: win.w, h: win.h };
    const startX = e.clientX;
    const startY = e.clientY;
    let dx0 = 0;
    let wasMaximized = win.maximized;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      if (wasMaximized) {
        // Pull a maximized window out under the pointer, keeping the grab point proportional.
        const r = useWindows.getState().windows[id]?.restore ?? { x: 80, y: 60, w: win.w, h: win.h };
        const ratio = (startX - area.left) / area.width;
        const x = Math.round(startX - area.left - r.w * ratio);
        setBounds(id, { x, y: 0, w: r.w, h: r.h });
        origin = { x, y: 0, w: r.w, h: r.h };
        dx0 = dx;
        wasMaximized = false;
        return; // let React commit before direct DOM writes resume
      }
      const next = clampBounds({ ...origin, x: origin.x + (dx - dx0), y: origin.y + dy }, { w: area.width, h: area.height }, app.minSize);
      live.current = next;
      apply(next);
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      const final = live.current;
      live.current = null;
      if (!moved) return;
      const canSnap = snapToEdges && app.resizable !== false;
      const px = ev.clientX - area.left;
      const py = ev.clientY - area.top;
      if (canSnap && py <= 2 && app.maximizable !== false) {
        if (final) setBounds(id, final);
        toggleMaximize(id);
      } else if (canSnap && px <= 2) {
        if (final) setBounds(id, final);
        snap(id, 'left');
      } else if (canSnap && px >= area.width - 3) {
        if (final) setBounds(id, final);
        snap(id, 'right');
      } else if (final) setBounds(id, final);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const startResize = (edge: Edge) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !canResize) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const area = workspaceRect();
    const o: Bounds = { x: win.x, y: win.y, w: win.w, h: win.h };
    const sx = e.clientX;
    const sy = e.clientY;
    const minW = app.minSize.w;
    const minH = app.minSize.h;

    const compute = (ev: PointerEvent): Bounds => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let { x, y, w, h } = o;
      if (edge.includes('e')) w = Math.max(minW, Math.min(o.w + dx, area.width - o.x));
      if (edge.includes('s')) h = Math.max(minH, Math.min(o.h + dy, area.height - o.y));
      if (edge.includes('w')) {
        const nw = Math.max(minW, o.w - dx);
        x = o.x + (o.w - nw);
        w = nw;
      }
      if (edge.includes('n')) {
        const ny = Math.max(0, Math.min(o.y + dy, o.y + o.h - minH));
        h = o.h + (o.y - ny);
        y = ny;
      }
      return { x, y, w, h };
    };
    const onMove = (ev: PointerEvent) => {
      const b = compute(ev);
      live.current = b;
      apply(b);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      const final = live.current;
      live.current = null;
      if (final) setBounds(id, final);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const b = live.current ?? win;
  const style: React.CSSProperties = maximized
    ? { inset: 0, zIndex: z }
    : { transform: `translate3d(${b.x}px,${b.y}px,0)`, width: b.w, height: b.h, zIndex: z };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`${win.title} window`}
      data-window-id={id}
      data-app-id={win.appId}
      data-focused={focused}
      tabIndex={-1}
      hidden={win.minimized}
      onPointerDownCapture={() => !focused && focus(id)}
      className={cn(
        'absolute top-0 left-0 flex flex-col overflow-hidden bg-surface outline-none s-anim-pop',
        maximized ? 'rounded-none border-0' : 'border',
        focused ? 'border-line2' : 'border-line',
      )}
      style={{
        ...style,
        borderRadius: maximized ? 0 : 'var(--s-radius)',
        borderWidth: maximized ? 0 : 'var(--s-border-w)',
        boxShadow: maximized ? 'none' : focused ? 'var(--s-shadow-win)' : '0 6px 20px -8px rgb(0 0 0 / 0.4)',
        willChange: 'transform',
      }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-line bg-chrome pr-1 pl-3 select-none"
        style={{ height: TITLEBAR_H, touchAction: 'none', cursor: 'default' }}
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if (canMaximize && !(e.target as HTMLElement).closest('button')) toggleMaximize(id);
        }}
      >
        <app.icon size={15} strokeWidth={1.7} className={focused ? 'text-accent' : 'text-faint'} aria-hidden />
        <div className={cn('min-w-0 flex-1 truncate text-[12.5px]', focused ? 'font-medium text-ink' : 'text-dim')}>{win.title}</div>
        <button className="s-icon-btn" aria-label={`Minimize ${win.title}`} title="Minimize" onClick={() => minimize(id)}>
          <Minus size={15} />
        </button>
        {canMaximize && (
          <button
            className="s-icon-btn"
            aria-label={win.maximized ? `Restore ${win.title}` : `Maximize ${win.title}`}
            title={win.maximized ? 'Restore' : 'Maximize'}
            onClick={() => toggleMaximize(id)}
          >
            {win.maximized ? <Copy size={13} /> : <Square size={12} />}
          </button>
        )}
        <button
          className="s-icon-btn hover:!bg-[var(--s-danger)] hover:!text-[#0b0c0f]"
          aria-label={`Close ${win.title}`}
          title="Close"
          onClick={() => void requestClose(id)}
        >
          <X size={15} />
        </button>
      </div>
      <div className="@container relative min-h-0 flex-1 overflow-hidden">
        <WindowContent windowId={id} appId={win.appId} props={win.props} />
      </div>
      {canResize && EDGES.map((edge) => <div key={edge} data-resize={edge} className={cn('absolute z-10', EDGE_CLASS[edge])} style={{ touchAction: 'none' }} onPointerDown={startResize(edge)} />)}
    </div>
  );
});
