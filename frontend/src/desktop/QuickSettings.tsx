import { BellOff, Expand, Layers, LayoutGrid, Moon, Settings as SettingsIcon, Sun, Monitor, Wifi, WifiOff, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACCENTS } from '@/app/constants';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi } from '@/stores/uiStore';
import { useOnline } from '@/hooks/useOnline';
import { useResolvedTheme } from '@/hooks/useApplySettings';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/utils/cn';
import type { AccentId, ThemeMode } from '@/types/settings';
import { panelAnchor, useDockMetrics } from './dockMetrics';

function Tile({ icon: Icon, label, on, onClick }: { icon: LucideIcon; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('flex items-center gap-2 rounded-[var(--s-radius-sm)] border px-2.5 py-2 text-left text-[12.5px] transition-colors', on ? 'border-accent bg-accentsoft text-ink' : 'border-line bg-surface2 text-dim hover:bg-surface3')}
    >
      <Icon size={15} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function QuickSettings() {
  const m = useDockMetrics();
  const s = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  const online = useOnline();
  const resolved = useResolvedTheme();
  const close = useUi((st) => st.closePanel);
  const fullscreen = !!document.fullscreenElement;

  return (
    <div className="s-panel s-anim-pop fixed z-[7000] w-[min(340px,calc(100vw-24px))] overflow-hidden" style={panelAnchor(m, 'end')} role="dialog" aria-label="Quick settings">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="m-0 text-[14px] font-semibold">Quick settings</h2>
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
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[12.5px] text-dim">
            {resolved === 'dark' ? <Moon size={14} /> : <Sun size={14} />} Theme
          </span>
          <Segmented<ThemeMode> label="Theme" value={s.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Auto' }]} />
        </div>
        <div>
          <div className="s-label mb-1.5">Accent</div>
          <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
            {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={s.accent === id}
                aria-label={ACCENTS[id].label}
                title={ACCENTS[id].label}
                onClick={() => update({ accent: id })}
                className="h-6 w-6 rounded-full border-2"
                style={{ background: resolved === 'dark' ? ACCENTS[id].dark : ACCENTS[id].light, borderColor: s.accent === id ? 'var(--s-text)' : 'transparent' }}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile icon={BellOff} label="Do not disturb" on={s.notifications.doNotDisturb} onClick={() => update({ notifications: { doNotDisturb: !s.notifications.doNotDisturb } })} />
          <Tile icon={Zap} label="Reduce motion" on={s.motion === 'reduced'} onClick={() => update({ motion: s.motion === 'reduced' ? 'auto' : 'reduced' })} />
          <Tile icon={LayoutGrid} label="Desktop icons" on={s.desktopIcons.visible} onClick={() => update({ desktopIcons: { visible: !s.desktopIcons.visible } })} />
          <Tile icon={Layers} label="Widgets" on={s.widgetsVisible} onClick={() => update({ widgetsVisible: !s.widgetsVisible })} />
          <Tile
            icon={fullscreen ? Monitor : Expand}
            label="Full screen"
            on={fullscreen}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen?.().catch(() => undefined);
              close();
            }}
          />
          <div className="flex items-center gap-2 rounded-[var(--s-radius-sm)] border border-line bg-surface2 px-2.5 py-2 text-[12.5px] text-dim">
            {online ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} className="text-warn" aria-hidden />}
            <span>{online ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        {!online && <p className="m-0 text-[12px] text-dim">You're offline. Solace's built-in apps keep working with locally stored data.</p>}
      </div>
    </div>
  );
}
