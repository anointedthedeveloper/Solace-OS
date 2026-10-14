import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

const FOCUSABLE = 'a[href],button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Role "alertdialog" for confirmations. */
  alert?: boolean;
  className?: string;
}

/** Accessible modal: focus trap, Esc to close, focus restored to the opener. */
export function Modal({ title, onClose, children, footer, width = 420, alert, className }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (node) {
      const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab' && ref.current) {
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] grid place-items-center p-4 s-anim-fade"
      style={{ background: 'var(--s-overlay)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={onKeyDown}
    >
      <div
        ref={ref}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('s-panel s-anim-pop flex max-h-[85vh] w-full flex-col outline-none', className)}
        style={{ maxWidth: width }}
      >
        <h2 id={titleId} className="m-0 px-5 pt-4 pb-1 text-[15px] font-semibold">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-2 text-dim">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pt-2 pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
