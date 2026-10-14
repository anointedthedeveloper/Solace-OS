import type { ReactNode } from 'react';

export function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13.5px] text-ink">{title}</div>
        {hint && <div className="mt-0.5 text-[12px] text-dim">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h3 className="s-label m-0 mb-1">{title}</h3>}
      <div>{children}</div>
    </section>
  );
}
