import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid h-full min-h-40 place-items-center p-6 text-center">
      <div className="flex max-w-xs flex-col items-center gap-2">
        <Icon size={30} strokeWidth={1.4} className="text-faint" aria-hidden />
        <div className="text-[14px] font-medium text-ink">{title}</div>
        {hint && <div className="text-[12.5px] text-dim">{hint}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
