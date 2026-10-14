import { useMemo, useRef, useState } from 'react';
import { getApp } from '@/applications/registry';
import { AppIcon } from '@/components/ui/AppIcon';
import { useDesktop, type DesktopIcon } from '@/stores/desktopStore';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi } from '@/stores/uiStore';
import { useLauncher } from '@/stores/launcherStore';
import { ICON_PX } from '@/app/constants';
import { cn } from '@/utils/cn';

const PAD = 10;

export function cellSize(iconPx: number) {
  return { w: iconPx + 36, h: iconPx + 40 };
}

/** Icons that no longer fit (after a resize) flow into the first free cells instead of disappearing. */
export function layoutIcons(icons: DesktopIcon[], rows: number, cols: number): DesktopIcon[] {
  const taken = new Set<string>();
  const out: DesktopIcon[] = [];
  const overflow: DesktopIcon[] = [];
  for (const i of icons) {
    if (i.row < rows && i.col < cols && !taken.has(`${i.col},${i.row}`)) {
      taken.add(`${i.col},${i.row}`);
      out.push(i);
    } else overflow.push(i);
  }
  for (const i of overflow) {
    let placed = false;
    for (let c = 0; c < Math.max(cols, 1) && !placed; c++)
      for (let r = 0; r < Math.max(rows, 1) && !placed; r++)
        if (!taken.has(`${c},${r}`)) {
          taken.add(`${c},${r}`);
          out.push({ ...i, col: c, row: r });
          placed = true;
        }
  }
  return out;
}

export function DesktopIcons() {
  const visible = useSettings((s) => s.settings.desktopIcons.visible);
  const size = useSettings((s) => s.settings.desktopIcons.size);
  const labels = useSettings((s) => s.settings.desktopIcons.labels);
  const icons = useDesktop((s) => s.icons);
  const area = useWindows((s) => s.workArea);
  const [selected, setSelected] = useState<string | null>(null);
  const px = ICON_PX[size];
  const cell = cellSize(px);
  const rows = Math.max(1, Math.floor((area.h - PAD) / cell.h));
  const cols = Math.max(1, Math.floor((area.w - PAD) / cell.w));
  const placed = useMemo(() => layoutIcons(icons, rows, cols), [icons, rows, cols]);
  const drag = useRef<{ appId: string; moved: boolean } | null>(null);

  if (!visible) return null;

  const open = (appId: string) => {
    useWindows.getState().openApp(appId);
    useLauncher.getState().record(appId);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, icon: DesktopIcon) => {
    if (e.button !== 0) return;
    setSelected(icon.appId);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    drag.current = { appId: icon.appId, moved: false };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!drag.current!.moved && Math.hypot(dx, dy) < 5) return;
      drag.current!.moved = true;
      el.style.transform = `translate(${dx}px,${dy}px)`;
      el.style.zIndex = '5';
      el.style.opacity = '0.85';
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      const moved = drag.current?.moved;
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.opacity = '';
      if (moved) {
        const col = Math.max(0, Math.min(cols - 1, Math.round((icon.col * cell.w + PAD + (ev.clientX - sx) - PAD) / cell.w)));
        const row = Math.max(0, Math.min(rows - 1, Math.round((icon.row * cell.h + PAD + (ev.clientY - sy) - PAD) / cell.h)));
        useDesktop.getState().moveTo(icon.appId, col, row);
      }
      setTimeout(() => (drag.current = null), 0);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="absolute inset-0 z-[1]" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
      {placed.map((icon) => {
        const app = getApp(icon.appId);
        if (!app) return null;
        return (
          <div
            key={icon.appId}
            role="button"
            tabIndex={0}
            aria-label={`${app.name}, desktop shortcut`}
            data-desktop-icon={app.id}
            className={cn('absolute flex flex-col items-center gap-1 rounded-[var(--s-radius-sm)] p-1.5 text-center select-none', selected === icon.appId ? 'bg-accentsoft shadow-[inset_0_0_0_1px_var(--s-accent-line)]' : 'hover:bg-[rgb(255_255_255/0.06)]')}
            style={{ left: PAD + icon.col * cell.w, top: PAD + icon.row * cell.h, width: cell.w - 6, touchAction: 'none' }}
            onPointerDown={(e) => onPointerDown(e, icon)}
            onDoubleClick={() => open(app.id)}
            onClick={(e) => {
              // Touch / coarse pointers: a single tap opens, like a phone home screen.
              if (!drag.current?.moved && (e.nativeEvent as PointerEvent).pointerType === 'touch') open(app.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open(app.id);
              }
            }}
            onFocus={() => setSelected(icon.appId)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(icon.appId);
              useUi.getState().openMenu(e.clientX, e.clientY, [
                { label: 'Open', onSelect: () => open(app.id) },
                { separator: true },
                { label: 'Remove from desktop', onSelect: () => useDesktop.getState().remove(app.id) },
              ]);
            }}
          >
            <AppIcon icon={app.icon} size={px * 0.78} className="!bg-chrome" />
            {labels && (
              <span className="line-clamp-2 w-full text-[12px] leading-tight break-words text-ink" style={{ textShadow: '0 1px 3px rgb(0 0 0 / 0.55)' }}>
                {app.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
