import { cn } from '@/utils/cn';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'border-line2 bg-surface3',
      )}
    >
      <span
        className={cn('absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full transition-transform', checked ? 'translate-x-4' : '')}
        style={{ background: checked ? 'var(--s-accent-fg)' : 'var(--s-text-dim)' }}
      />
    </button>
  );
}
