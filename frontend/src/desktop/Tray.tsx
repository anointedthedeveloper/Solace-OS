import { Bell, BellOff, SlidersHorizontal, Wifi, WifiOff, BatteryMedium } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettings } from '@/stores/settingsStore';
import { useUi } from '@/stores/uiStore';
import { useNotifications } from '@/stores/notificationStore';
import { useNow } from '@/hooks/useNow';
import { useOnline } from '@/hooks/useOnline';
import { cn } from '@/utils/cn';

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

function useBattery(): { level: number; charging: boolean } | null {
  const [state, setState] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;
    let bat: BatteryManager | null = null;
    let alive = true;
    const update = () => bat && alive && setState({ level: bat.level, charging: bat.charging });
    nav.getBattery().then((b) => {
      bat = b;
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    }).catch(() => undefined);
    return () => {
      alive = false;
      bat?.removeEventListener('levelchange', update);
      bat?.removeEventListener('chargingchange', update);
    };
  }, []);
  return state;
}

export function useClockText() {
  const { hour12, showSeconds } = useSettings((s) => s.settings.clock);
  const now = useNow(showSeconds ? 1000 : 5000);
  return {
    time: now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined, hour12 }),
    date: now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    now,
  };
}

export function Tray({ vertical, bar }: { vertical?: boolean; bar?: boolean }) {
  const online = useOnline();
  const battery = useBattery();
  const dnd = useSettings((s) => s.settings.notifications.doNotDisturb);
  const unread = useNotifications((s) => s.items.filter((i) => !i.read).length);
  const panel = useUi((s) => s.panel);
  const toggle = useUi((s) => s.togglePanel);
  const { time, date } = useClockText();

  return (
    <div
      className={cn('flex items-center gap-0.5', vertical ? 'flex-col px-1 py-1.5' : 'px-1.5', !bar && 'rounded-[calc(var(--s-radius)+4px)] border border-line2 bg-chrome')}
      style={{ boxShadow: bar ? undefined : 'var(--s-shadow-pop)', height: vertical ? undefined : 'calc(var(--s-dock-size) + 4px)' }}
      role="group"
      aria-label="System tray"
    >
      <button
        type="button"
        className={cn('flex h-7 items-center gap-1.5 rounded-[var(--s-radius-sm)] px-2 text-dim hover:bg-surface3 hover:text-ink', vertical && 'flex-col py-1.5 h-auto', panel === 'quickSettings' && '!bg-accentsoft !text-accent')}
        aria-label={`Quick settings. ${online ? 'Online' : 'Offline'}${battery ? `, battery ${Math.round(battery.level * 100)}%` : ''}`}
        aria-expanded={panel === 'quickSettings'}
        title="Quick settings"
        onClick={() => toggle('quickSettings')}
      >
        {online ? <Wifi size={15} /> : <WifiOff size={15} className="text-warn" />}
        {battery && !vertical && (
          <span className="flex items-center gap-0.5 text-[11.5px]">
            <BatteryMedium size={15} />
            {Math.round(battery.level * 100)}%
          </span>
        )}
        <SlidersHorizontal size={14} />
      </button>
      <button
        type="button"
        className={cn('s-icon-btn relative', panel === 'notifications' && '!bg-accentsoft !text-accent')}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}${dnd ? ', do not disturb is on' : ''}`}
        aria-expanded={panel === 'notifications'}
        title="Notifications"
        onClick={() => toggle('notifications')}
      >
        {dnd ? <BellOff size={15} /> : <Bell size={15} />}
        {unread > 0 && !dnd && <span className="absolute top-[3px] right-[3px] h-[7px] w-[7px] rounded-full bg-accent" aria-hidden />}
      </button>
      <button
        type="button"
        className={cn('flex flex-col items-end justify-center rounded-[var(--s-radius-sm)] px-2 leading-tight hover:bg-surface3', vertical && 'items-center px-0', panel === 'clock' && 'bg-accentsoft')}
        aria-label={`${time}, ${date}. Open calendar popover`}
        aria-expanded={panel === 'clock'}
        onClick={() => toggle('clock')}
      >
        <span className="text-[12.5px] font-medium text-ink tabular-nums">{vertical ? time.replace(/\s?[AP]M/i, '') : time}</span>
        {!vertical && <span className="text-[11px] text-dim">{date}</span>}
      </button>
    </div>
  );
}
