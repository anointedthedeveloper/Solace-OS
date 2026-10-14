import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Monitor, Pin, PinOff, Search, Settings as SettingsIcon } from 'lucide-react';
import { APPS, getApp } from '@/applications/registry';
import type { AppDef } from '@/applications/types';
import { AppIcon } from '@/components/ui/AppIcon';
import { useSettings } from '@/stores/settingsStore';
import { useLauncher } from '@/stores/launcherStore';
import { useUi } from '@/stores/uiStore';
import { useWindows } from '@/stores/windowStore';
import { useDesktop } from '@/stores/desktopStore';
import { prettyCombo } from '@/utils/shortcuts';
import { normalizeUrl, hostOf } from '@/utils/url';
import { cn } from '@/utils/cn';
import { panelAnchor, useDockMetrics } from './dockMetrics';

export function rankApps(query: string, apps: AppDef[] = APPS): AppDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return apps;
  const scored: Array<[number, AppDef]> = [];
  for (const a of apps) {
    const name = a.name.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 65;
    else if (name.includes(q)) score = 50;
    else if (a.keywords.some((k) => k.startsWith(q))) score = 40;
    else if (a.keywords.some((k) => k.includes(q)) || a.description.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)) score = 25;
    if (score) scored.push([score, a]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).map(([, a]) => a);
}

type Row = { key: string; section: string; app?: AppDef; url?: string };

export function Launcher() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const m = useDockMetrics();
  const close = useUi((s) => s.closePanel);
  const pinned = useSettings((s) => s.settings.dock.pinned);
  const name = useSettings((s) => s.settings.displayName);
  const launcherKey = useSettings((s) => s.settings.shortcuts.launcher);
  const { pin, unpin } = useSettings.getState();
  const recents = useLauncher((s) => s.recents);

  useEffect(() => inputRef.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    if (q) {
      const out: Row[] = rankApps(q).map((app) => ({ key: `r-${app.id}`, section: 'Applications', app }));
      const url = normalizeUrl(q);
      if (url) out.push({ key: 'url', section: 'Web', url });
      return out;
    }
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const id of pinned) {
      const app = getApp(id);
      if (app) out.push({ key: `p-${id}`, section: 'Pinned', app });
    }
    for (const id of recents) {
      const app = getApp(id);
      if (app && !seen.has(id)) {
        seen.add(id);
        out.push({ key: `rc-${id}`, section: 'Recent', app });
      }
    }
    for (const app of [...APPS].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) out.push({ key: `a-${app.id}`, section: app.category, app });
    return out;
  }, [query, pinned, recents]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const launch = (row: Row | undefined) => {
    if (!row) return;
    close();
    if (row.app) {
      useWindows.getState().openApp(row.app.id);
      useLauncher.getState().record(row.app.id);
    } else if (row.url) window.open(row.url, '_blank', 'noopener,noreferrer');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      launch(rows[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const rowMenu = (e: React.MouseEvent, app: AppDef) => {
    e.preventDefault();
    const isPinned = pinned.includes(app.id);
    useUi.getState().openMenu(e.clientX, e.clientY, [
      { label: 'Open', onSelect: () => launch({ key: 'x', section: '', app }) },
      isPinned ? { label: 'Unpin from dock', icon: PinOff, onSelect: () => unpin(app.id) } : { label: 'Pin to dock', icon: Pin, onSelect: () => pin(app.id) },
      { label: 'Add to desktop', icon: Monitor, onSelect: () => useDesktop.getState().add(app.id, 6) },
    ]);
  };

  let lastSection = '';
  return (
    <div
      className="s-panel s-anim-pop fixed z-[7000] flex max-h-[min(560px,calc(100vh-120px))] w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden"
      style={panelAnchor(m, 'center')}
      role="dialog"
      aria-label="Application launcher"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Search size={16} className="text-faint" aria-hidden />
        <input
          ref={inputRef}
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-faint"
          placeholder="Search apps, or type a web address"
          aria-label="Search applications"
          role="combobox"
          aria-expanded="true"
          aria-controls="launcher-results"
          aria-activedescendant={rows[active] ? `launcher-row-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="s-kbd" aria-hidden>
          Esc
        </span>
      </div>
      <div ref={listRef} id="launcher-results" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {rows.length === 0 && (
          <div className="px-3 py-8 text-center text-[13px] text-dim">
            No applications match “{query}”.
          </div>
        )}
        {rows.map((row, i) => {
          const header = row.section !== lastSection ? row.section : null;
          lastSection = row.section;
          return (
            <div key={row.key}>
              {header && <div className="s-label px-2.5 pt-2.5 pb-1">{header}</div>}
              <div
                id={`launcher-row-${i}`}
                data-row={i}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => launch(row)}
                onContextMenu={row.app ? (e) => rowMenu(e, row.app!) : undefined}
                className={cn('flex cursor-default items-center gap-3 rounded-[var(--s-radius-sm)] px-2.5 py-1.5', i === active && 'bg-accentsoft')}
              >
                {row.app ? <AppIcon icon={row.app.icon} size={32} /> : <AppIcon icon={ExternalLink} size={32} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] text-ink">{row.app ? row.app.name : `Open ${hostOf(row.url!)}`}</div>
                  <div className="truncate text-[12px] text-dim">{row.app ? row.app.description : `${row.url} — external website, opens in a new tab`}</div>
                </div>
                {row.app && pinned.includes(row.app.id) && row.section !== 'Pinned' && <Pin size={12} className="text-faint" aria-label="Pinned" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-dim">
        <span className="truncate">{name ? name : 'Solace OS'}</span>
        <span className="flex items-center gap-2">
          <span className="hidden sm:inline">
            <span className="s-kbd">{prettyCombo(launcherKey)}</span> toggles
          </span>
          <button
            className="s-icon-btn"
            aria-label="Open Settings"
            title="Settings"
            onClick={() => {
              close();
              useWindows.getState().openApp('settings');
            }}
          >
            <SettingsIcon size={15} />
          </button>
        </span>
      </div>
    </div>
  );
}
