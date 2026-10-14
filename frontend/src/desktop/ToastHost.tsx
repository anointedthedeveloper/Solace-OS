import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useNotifications, type SolaceNotification } from '@/stores/notificationStore';

function Toast({ n }: { n: SolaceNotification }) {
  const dismiss = useNotifications((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(n.id), 5500);
    return () => clearTimeout(t);
  }, [n.id, dismiss]);
  const bar = { info: 'var(--s-accent)', success: 'var(--s-success)', warning: 'var(--s-warn)', error: 'var(--s-danger)' }[n.level];
  return (
    <div role="status" className="s-panel s-anim-pop pointer-events-auto flex w-[300px] items-start gap-3 overflow-hidden p-3 pl-4" style={{ boxShadow: 'var(--s-shadow-pop)', borderLeft: `3px solid ${bar}` }}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{n.title}</div>
        {n.body && <div className="mt-0.5 line-clamp-3 text-[12.5px] text-dim">{n.body}</div>}
      </div>
      <button className="s-icon-btn -mt-1 -mr-1" aria-label="Dismiss notification" onClick={() => dismiss(n.id)}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useNotifications((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-3 right-3 z-[8000] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} n={t} />
      ))}
    </div>
  );
}
