import { useEffect, useState } from 'react';
import { ACCENTS, CORNER_PX, DENSITY_SCALE, DOCK_PX, ICON_PX } from '@/app/constants';
import { useSettings } from '@/stores/settingsStore';
import { readableOn } from '@/utils/color';

export function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true));
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return dark;
}

/** Resolve the effective theme ("system" follows the OS). */
export function useResolvedTheme(): 'dark' | 'light' {
  const theme = useSettings((s) => s.settings.theme);
  const sysDark = useSystemDark();
  return theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;
}

/** Applies design tokens from settings to the document root. Runs for the whole app lifetime. */
export function useApplySettings() {
  const s = useSettings((st) => st.settings);
  const theme = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENTS[s.accent] ?? ACCENTS.lavender;
    const accentHex = theme === 'dark' ? accent.dark : accent.light;
    root.dataset.theme = theme;
    root.dataset.motion = s.motion === 'reduced' ? 'reduced' : s.motion === 'full' ? 'full' : 'auto';
    root.style.setProperty('--s-accent', accentHex);
    root.style.setProperty('--s-accent-fg', readableOn(accentHex));
    root.style.setProperty('--s-radius', `${CORNER_PX[s.windows.corners]}px`);
    root.style.setProperty('--s-density', String(DENSITY_SCALE[s.density]));
    root.style.setProperty('--s-icon-size', `${ICON_PX[s.desktopIcons.size]}px`);
    root.style.setProperty('--s-dock-size', `${DOCK_PX[s.dock.size]}px`);
    root.style.setProperty('--s-border-w', s.windows.border === 'none' ? '0px' : '1px');
    root.dataset.border = s.windows.border;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#0b0c0f' : '#e9ebf0');
  }, [s.accent, s.motion, s.windows.corners, s.windows.border, s.density, s.desktopIcons.size, s.dock.size, theme]);
}
