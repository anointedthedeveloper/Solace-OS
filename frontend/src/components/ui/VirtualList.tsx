import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  overscan?: number;
  className?: string;
  label?: string;
  role?: string;
  /** Row index to keep in view (keyboard navigation). */
  scrollToIndex?: number;
}

/** Fixed-row-height windowed list: renders only the rows in (and just around) the viewport. */
export function VirtualList<T>({ items, rowHeight, renderRow, getKey, overscan = 6, className, label, role = 'list', scrollToIndex }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight || 400);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && scrollToIndex !== undefined && scrollToIndex >= 0) {
      const top = scrollToIndex * rowHeight;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight;
    }
  }, [scrollToIndex, rowHeight]);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  return (
    <div ref={ref} className={className} style={{ overflowY: 'auto', position: 'relative' }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role={role} aria-label={label}>
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => (
          <div key={getKey(item)} style={{ position: 'absolute', top: (start + i) * rowHeight, height: rowHeight, left: 0, right: 0 }} role={role === 'list' ? 'listitem' : undefined}>
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
