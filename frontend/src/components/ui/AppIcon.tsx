import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Rounded-square app glyph used in the dock, launcher and desktop. */
export function AppIcon({ icon: Icon, size = 40, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center border border-line2 bg-surface2 text-ink', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.6} />
    </span>
  );
}
