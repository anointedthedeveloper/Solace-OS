import { DOCK_PX } from '@/app/constants';
import { useSettings } from '@/stores/settingsStore';

/** Space reserved for the taskbar/dock, which also anchors popover panels. */
export function useDockMetrics() {
  const dock = useSettings((s) => s.settings.dock);
  const item = DOCK_PX[dock.size];
  const thickness = dock.style === 'floating' ? item + 28 : item + 16;
  return { position: dock.position, style: dock.style, item, thickness, vertical: dock.position !== 'bottom' };
}

/** Fixed-position style that places a popover panel next to the dock. */
export function panelAnchor(m: ReturnType<typeof useDockMetrics>, align: 'start' | 'center' | 'end'): React.CSSProperties {
  const gap = m.thickness + 6;
  if (m.position === 'bottom') {
    const base: React.CSSProperties = { bottom: gap };
    if (align === 'center') return { ...base, left: '50%', transform: 'translateX(-50%)' };
    return align === 'end' ? { ...base, right: 12 } : { ...base, left: 12 };
  }
  const side = m.position === 'left' ? { left: gap } : { right: gap };
  return { ...side, bottom: 12 };
}
