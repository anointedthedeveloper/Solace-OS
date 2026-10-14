import { cn } from '@/utils/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--s-radius-sm)] border border-line bg-surface2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[calc(var(--s-radius-sm)-2px)] px-3 py-1 text-[12.5px] transition-colors',
            value === o.value ? 'bg-surface3 font-medium text-ink shadow-sm' : 'text-dim hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
