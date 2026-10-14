import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { useUi, type MenuItem } from '@/stores/uiStore';
import { cn } from '@/utils/cn';

function MenuList({ items, onClose, x, y, depth = 0, autoFocus = true, onBack }: { items: MenuItem[]; onClose: () => void; x: number; y: number; depth?: number; autoFocus?: boolean; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);
  const [focusSub, setFocusSub] = useState(false);
  const enabled = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const ny = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    if (autoFocus) ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [autoFocus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])].filter((b) => b.closest('[role="menu"]') === ref.current);
    const idx = btns.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(idx + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(idx - 1 + btns.length) % btns.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      btns[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      btns[btns.length - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx >= 0) {
      const item = items[enabled[idx]];
      if (item?.children) {
        e.preventDefault();
        e.stopPropagation();
        setFocusSub(true);
        setOpen(enabled[idx]);
      }
    } else if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      onKeyDown={onKeyDown}
      className="s-panel s-anim-pop fixed min-w-[188px] p-1"
      style={{ left: pos.x, top: pos.y, zIndex: 9500 + depth }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} role="separator" className="my-1 h-px bg-line" />
        ) : (
          <div key={i} className="relative" onMouseEnter={() => setOpen(it.children ? i : null)}>
            <button
              role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={it.checked}
              aria-disabled={it.disabled || undefined}
              aria-haspopup={it.children ? 'menu' : undefined}
              aria-expanded={it.children ? open === i : undefined}
              tabIndex={-1}
              className={cn(
                'flex w-full items-center gap-2 rounded-[var(--s-radius-sm)] px-2 py-[5px] text-left text-[13px]',
                it.disabled ? 'cursor-not-allowed text-faint' : 'hover:bg-surface3 focus:bg-surface3',
                it.danger && !it.disabled && 'text-danger',
              )}
              onClick={() => {
                if (it.disabled) return;
                if (it.children) return setOpen(i);
                onClose();
                it.onSelect?.();
              }}
            >
              <span className="grid w-4 place-items-center">{it.checked ? <Check size={14} /> : it.icon ? <it.icon size={14} strokeWidth={1.7} /> : null}</span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
              {it.children && <ChevronRight size={13} className="text-faint" />}
            </button>
            {it.children && open === i && (
              <MenuList
                items={it.children}
                onClose={onClose}
                x={pos.x + (ref.current?.offsetWidth ?? 190) - 2}
                y={pos.y + ((ref.current?.children[i] as HTMLElement | undefined)?.offsetTop ?? 0)}
                depth={depth + 1}
                autoFocus={open === i && focusSub}
                onBack={() => {
                  setOpen(null);
                  setFocusSub(false);
                  (ref.current?.children[i]?.querySelector('button') as HTMLElement | null)?.focus();
                }}
              />
            )}
          </div>
        ),
      )}
    </div>
  );
}

export function ContextMenuHost() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    opener.current = document.activeElement as HTMLElement | null;
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[role="menu"]')) close();
    };
    const blur = () => close();
    window.addEventListener('mousedown', down, true);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', blur);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', blur);
    };
  }, [menu, close]);

  if (!menu) return null;
  return createPortal(<MenuList key={`${menu.x},${menu.y}`} items={menu.items} onClose={close} x={menu.x} y={menu.y} />, document.body);
}

/** Helper: build an onContextMenu handler for any element. */
export function contextMenuHandler(items: MenuItem[] | (() => MenuItem[])) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useUi.getState().openMenu(e.clientX, e.clientY, typeof items === 'function' ? items() : items);
  };
}
