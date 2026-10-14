import { memo, useMemo } from 'react';
import { Pin, PinOff, Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { APPS, getApp } from '@/applications/registry';
import { Logo } from '@/components/ui/Logo';
import { AppIcon } from '@/components/ui/AppIcon';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi, type MenuItem } from '@/stores/uiStore';
import { useLauncher } from '@/stores/launcherStore';
import { requestClose } from '@/services/closeGuards';
import { cn } from '@/utils/cn';
import { Tray } from './Tray';
import { useDockMetrics } from './dockMetrics';

interface DockEntry {
  appId: string;
  windowIds: string[];
  pinned: boolean;
  allMinimized: boolean;
}

/** Click behaviour: open → focus → minimise, with a window picker when several are open. */
export function activateApp(appId: string, e?: { clientX: number; clientY: number }) {
  const w = useWindows.getState();
  const ids = Object.keys(w.windows).filter((id) => w.windows[id].appId === appId);
  if (ids.length === 0) {
    w.openApp(appId);
    useLauncher.getState().record(appId);
    return;
  }
  if (ids.length === 1) {
    const id = ids[0];
    const win = w.windows[id];
    if (win.minimized) w.focus(id);
    else if (w.focusedId === id) w.minimize(id);
    else w.focus(id);
    return;
  }
  const items: MenuItem[] = ids.map((id) => ({
    label: w.windows[id].title + (w.windows[id].minimized ? ' (minimized)' : ''),
    checked: w.focusedId === id,
    onSelect: () => useWindows.getState().focus(id),
  }));
  useUi.getState().openMenu(e?.clientX ?? 200, (e?.clientY ?? 500) - 20 - items.length * 30, items);
}

const DockButton = memo(function DockButton({ entry, focused, size, vertical, showLabel, side }: { entry: DockEntry; focused: boolean; size: number; vertical: boolean; showLabel: boolean; side: 'left' | 'right' | 'bottom' }) {
  const app = getApp(entry.appId);
  const { pin, unpin, movePinned } = useSettings(useShallow((s) => ({ pin: s.pin, unpin: s.unpin, movePinned: s.movePinned })));
  if (!app) return null;
  const running = entry.windowIds.length > 0;
  const allMinimized = running && entry.allMinimized;

  const menu = (): MenuItem[] => {
    const items: MenuItem[] = [];
    items.push({ label: running && app.singleton ? 'Show' : running ? 'New window' : 'Open', icon: Plus, onSelect: () => (running && !app.singleton ? useWindows.getState().openApp(app.id) : activateApp(app.id)) });
    if (running) items.push({ label: entry.windowIds.length > 1 ? 'Close all windows' : 'Close', icon: X, onSelect: () => void Promise.all(entry.windowIds.map((id) => requestClose(id))) });
    items.push({ separator: true });
    items.push(entry.pinned ? { label: 'Unpin from dock', icon: PinOff, onSelect: () => unpin(app.id) } : { label: 'Pin to dock', icon: Pin, onSelect: () => pin(app.id) });
    if (entry.pinned) {
      items.push({ label: vertical ? 'Move up' : 'Move left', onSelect: () => movePinned(app.id, -1) });
      items.push({ label: vertical ? 'Move down' : 'Move right', onSelect: () => movePinned(app.id, 1) });
    }
    return items;
  };

  return (
    <button
      type="button"
      data-dock-app={app.id}
      aria-label={app.name + (running ? ` — ${entry.windowIds.length} open` : '')}
      aria-pressed={focused}
      title={app.name}
      onClick={(e) => activateApp(app.id, e)}
      onContextMenu={(e) => {
        e.preventDefault();
        useUi.getState().openMenu(e.clientX, e.clientY, menu());
      }}
      className={cn(
        'group relative flex shrink-0 items-center gap-2 rounded-[var(--s-radius-sm)] p-[3px] transition-colors hover:bg-surface3',
        focused && 'bg-accentsoft',
        vertical ? 'flex-col' : 'flex-row',
      )}
    >
      <AppIcon icon={app.icon} size={size - 8} className={cn(focused && '!border-accent', allMinimized && 'opacity-60')} />
      {showLabel && <span className="max-w-24 truncate pr-1 text-[12px] text-dim">{app.name}</span>}
      {running && (
        <span
          aria-hidden
          className={cn('absolute rounded-full', vertical ? 'top-1/2 -translate-y-1/2' : 'left-1/2 -translate-x-1/2')}
          style={{
            ...(vertical ? { [side]: -1, width: 3, height: focused ? 14 : 5 } : { bottom: -2, height: 3, width: focused ? 14 : 5 }),
            background: allMinimized ? 'transparent' : focused ? 'var(--s-accent)' : 'var(--s-text-faint)',
            border: allMinimized ? '1px solid var(--s-text-faint)' : 'none',
            transition: 'width .14s, height .14s',
          }}
        />
      )}
    </button>
  );
});

export function Taskbar() {
  const m = useDockMetrics();
  const pinned = useSettings((s) => s.settings.dock.pinned);
  const showLabels = useSettings((s) => s.settings.dock.showLabels);
  const wins = useWindows(useShallow((s) => Object.values(s.windows).map((w) => `${w.id}:${w.appId}:${w.minimized ? 1 : 0}`)));
  const focusedAppId = useWindows((s) => (s.focusedId && s.windows[s.focusedId] && !s.windows[s.focusedId].minimized ? s.windows[s.focusedId].appId : null));

  const entries = useMemo<DockEntry[]>(() => {
    const byApp = new Map<string, { ids: string[]; min: boolean[] }>();
    for (const w of wins) {
      const [id, appId, min] = w.split(':');
      const cur = byApp.get(appId) ?? { ids: [], min: [] };
      byApp.set(appId, { ids: [...cur.ids, id], min: [...cur.min, min === '1'] });
    }
    const mk = (appId: string, isPinned: boolean): DockEntry => {
      const g = byApp.get(appId);
      return { appId, windowIds: g?.ids ?? [], pinned: isPinned, allMinimized: !!g && g.min.every(Boolean) };
    };
    const out: DockEntry[] = pinned.filter((id) => getApp(id)).map((id) => mk(id, true));
    for (const appId of byApp.keys()) if (!pinned.includes(appId)) out.push(mk(appId, false));
    return out;
  }, [wins, pinned]);

  const launcherOpen = useUi((s) => s.panel === 'launcher');
  const togglePanel = useUi((s) => s.togglePanel);
  const unpinnedStart = entries.findIndex((e) => !e.pinned);
  const bar = m.style === 'bar';

  const apps = (
    <div className={cn('flex items-center gap-1', m.vertical ? 'flex-col' : 'flex-row')} role="toolbar" aria-label="Applications" aria-orientation={m.vertical ? 'vertical' : 'horizontal'}>
      <button
        type="button"
        aria-label="Open launcher"
        aria-expanded={launcherOpen}
        title="Launcher"
        data-testid="launcher-button"
        onClick={() => togglePanel('launcher')}
        className={cn('grid shrink-0 place-items-center rounded-[var(--s-radius-sm)] text-ink transition-colors hover:bg-surface3', launcherOpen && 'bg-accentsoft text-accent')}
        style={{ width: m.item, height: m.item }}
      >
        <Logo size={m.item - 12} />
      </button>
      <div className={cn('bg-line', m.vertical ? 'my-1 h-px w-6' : 'mx-1 h-6 w-px')} aria-hidden />
      {entries.map((entry, i) => (
        <div key={entry.appId} className={cn('flex items-center', m.vertical ? 'flex-col' : 'flex-row')}>
          {i === unpinnedStart && i > 0 && <div className={cn('bg-line', m.vertical ? 'my-1 h-px w-6' : 'mx-1 h-6 w-px')} aria-hidden />}
          <DockButton entry={entry} focused={focusedAppId === entry.appId} size={m.item} vertical={m.vertical} showLabel={showLabels && !m.vertical} side={m.position === 'left' ? 'left' : m.position === 'right' ? 'right' : 'bottom'} />
        </div>
      ))}
    </div>
  );

  const pillClass = 'border border-line2 bg-chrome';
  const noApps = APPS.length === 0;

  if (m.vertical) {
    return (
      <nav aria-label="Taskbar" className={cn('flex shrink-0 flex-col items-center justify-between', bar ? cn('bg-chrome', m.position === 'left' ? 'border-r border-line' : 'border-l border-line') : 'p-3')} style={{ width: m.thickness }}>
        <div className={cn('flex flex-col items-center', !bar && cn('rounded-[calc(var(--s-radius)+4px)] px-1 py-1.5', pillClass))} style={{ boxShadow: bar ? undefined : 'var(--s-shadow-pop)' }}>
          {!noApps && apps}
        </div>
        <Tray vertical bar={bar} />
      </nav>
    );
  }

  return (
    <nav aria-label="Taskbar" className={cn('relative flex shrink-0 items-center', bar ? 'justify-center border-t border-line bg-chrome px-2' : 'justify-center px-3 pb-3')} style={{ height: m.thickness }}>
      <div className={cn('flex items-center', !bar && cn('rounded-[calc(var(--s-radius)+4px)] px-1.5 py-1', pillClass))} style={{ boxShadow: bar ? undefined : 'var(--s-shadow-pop)', maxWidth: 'calc(100% - 330px)', overflowX: 'auto' }}>
        {apps}
      </div>
      <div className={cn('absolute right-2 flex items-center', bar ? 'inset-y-0' : 'bottom-3 h-[calc(100%-12px)]')}>
        <Tray bar={bar} />
      </div>
    </nav>
  );
}
