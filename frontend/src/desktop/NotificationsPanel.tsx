import { Bell, BellOff, Check, Trash2, X } from 'lucide-react';
import { useNotifications } from '@/stores/notificationStore';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi } from '@/stores/uiStore';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelative } from '@/utils/format';
import { panelAnchor, useDockMetrics } from './dockMetrics';

export function NotificationsPanel() {
  const m = useDockMetrics();
  const { items, markAllRead, remove, clear } = useNotifications();
  const dnd = useSettings((s) => s.settings.notifications.doNotDisturb);
  const enabled = useSettings((s) => s.settings.notifications.enabled);
  const update = useSettings((s) => s.update);
  const close = useUi((s) => s.closePanel);

  return (
    <div className="s-panel s-anim-pop fixed z-[7000] flex max-h-[min(540px,calc(100vh-100px))] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden" style={panelAnchor(m, 'end')} role="dialog" aria-label="Notifications">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="m-0 text-[14px] font-semibold">Notifications</h2>
        <div className="flex items-center gap-1">
          <button className="s-icon-btn" aria-label="Mark all as read" title="Mark all as read" onClick={markAllRead} disabled={!items.some((i) => !i.read)}>
            <Check size={15} />
          </button>
          <button className="s-icon-btn" aria-label="Clear all notifications" title="Clear all" onClick={clear} disabled={items.length === 0}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-[12.5px]">
        <span className="flex items-center gap-2 text-dim">
          <BellOff size={14} aria-hidden /> Do not disturb
        </span>
        <Switch label="Do not disturb" checked={dnd} onChange={(v) => update({ notifications: { doNotDisturb: v } })} disabled={!enabled} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!enabled && <div className="border-b border-line px-3 py-2 text-[12px] text-warn">Notifications are turned off in Settings.</div>}
        {items.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up" hint="Notifications from Solace and its apps will appear here." />
        ) : (
          <ul className="m-0 list-none p-1.5">
            {items.map((n) => (
              <li key={n.id} className="group flex items-start gap-2.5 rounded-[var(--s-radius-sm)] px-2.5 py-2 hover:bg-surface3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read ? 'transparent' : 'var(--s-accent)', border: n.read ? '1px solid var(--s-border-strong)' : 'none' }} aria-label={n.read ? 'Read' : 'Unread'} />
                <button
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
                  onClick={() => {
                    if (n.appId) {
                      close();
                      useWindows.getState().openApp(n.appId);
                    }
                  }}
                >
                  <div className="truncate text-[13px] text-ink">{n.title}</div>
                  {n.body && <div className="line-clamp-2 text-[12.5px] text-dim">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-faint">{formatRelative(n.time)}</div>
                </button>
                <button className="s-icon-btn opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" aria-label={`Dismiss ${n.title}`} onClick={() => remove(n.id)}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
