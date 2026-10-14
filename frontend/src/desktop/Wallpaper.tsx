import { useEffect, useState } from 'react';
import { WALLPAPERS } from '@/app/constants';
import { useSettings } from '@/stores/settingsStore';
import { useResolvedTheme } from '@/hooks/useApplySettings';
import { loadCustomWallpaper } from '@/services/wallpaperStorage';
import type { WallpaperFit } from '@/types/settings';

const GRADIENTS: Record<string, string> = {
  graphite: 'linear-gradient(160deg,#1b1d22 0%,#0e0f12 100%)',
  dusk: 'radial-gradient(1100px 650px at 72% 8%,#2c3556 0%,transparent 62%),radial-gradient(900px 600px at 10% 100%,#1c2238 0%,transparent 60%),#0e1017',
  slate: 'radial-gradient(900px 600px at 18% 85%,#27323f 0%,transparent 60%),linear-gradient(135deg,#1f232b,#13151a)',
  mist: 'linear-gradient(160deg,#f0f2f7 0%,#dde1ea 100%)',
  paper: 'radial-gradient(900px 600px at 50% 0%,#faf8f3 0%,transparent 70%),#efede7',
  dawn: 'radial-gradient(1000px 640px at 85% 0%,#f4e1da 0%,transparent 60%),radial-gradient(800px 560px at 0% 100%,#dde3f2 0%,transparent 60%),#e9ebf2',
};

/** The signature wallpaper: a quiet ring and the orb that orbits it. */
function Eclipse() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="ec-bg" cx="62%" cy="52%" r="75%">
          <stop offset="0" stopColor="#15171d" />
          <stop offset="0.6" stopColor="#0d0e12" />
          <stop offset="1" stopColor="#08090b" />
        </radialGradient>
        <linearGradient id="ec-ring" x1="420" y1="120" x2="1260" y2="800" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2f3f7" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#c9ccd6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#c9ccd6" stopOpacity="0.02" />
        </linearGradient>
        <filter id="ec-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#ec-bg)" />
      <circle cx="960" cy="470" r="330" fill="none" stroke="url(#ec-ring)" strokeWidth="3" />
      <circle cx="960" cy="470" r="330" fill="none" stroke="url(#ec-ring)" strokeWidth="14" opacity="0.12" filter="url(#ec-glow)" />
      <circle cx="702" cy="262" r="34" fill="#fff" opacity="0.5" filter="url(#ec-glow)" />
      <circle cx="702" cy="262" r="17" fill="#f7f8fb" />
    </svg>
  );
}

const FIT_STYLE: Record<WallpaperFit, React.CSSProperties> = {
  cover: { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
  contain: { backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
  stretch: { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' },
  center: { backgroundSize: 'auto', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
  tile: { backgroundSize: 'auto', backgroundRepeat: 'repeat' },
};

export function useCustomWallpaperUrl(enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return setUrl(null);
    let current: string | null = null;
    let cancelled = false;
    const load = () =>
      void loadCustomWallpaper().then((blob) => {
        if (cancelled) return;
        if (current) URL.revokeObjectURL(current);
        current = blob ? URL.createObjectURL(blob) : null;
        setUrl(current);
      });
    load();
    window.addEventListener('solace:wallpaper', load);
    return () => {
      cancelled = true;
      window.removeEventListener('solace:wallpaper', load);
      if (current) URL.revokeObjectURL(current);
    };
  }, [enabled]);
  return url;
}

/** Wallpaper art by id. `fit` and `customUrl` only matter for the custom wallpaper. */
export function WallpaperArt({ id, fit = 'cover', customUrl }: { id: string; fit?: WallpaperFit; customUrl?: string | null }) {
  if (id === 'custom') {
    return <div className="absolute inset-0" style={{ background: customUrl ? `var(--s-bg) url("${customUrl}")` : 'var(--s-bg)', ...FIT_STYLE[fit] }} />;
  }
  if (id === 'eclipse') return <Eclipse />;
  return <div className="absolute inset-0" style={{ background: GRADIENTS[id] ?? GRADIENTS.graphite }} />;
}

export function Wallpaper() {
  const wallpaper = useSettings((s) => s.settings.wallpaper);
  const fit = useSettings((s) => s.settings.wallpaperFit);
  const theme = useResolvedTheme();
  const id = wallpaper === 'auto' ? (theme === 'dark' ? 'eclipse' : 'mist') : WALLPAPERS.some((w) => w.id === wallpaper) || wallpaper === 'custom' ? wallpaper : 'eclipse';
  const customUrl = useCustomWallpaperUrl(id === 'custom');
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden data-wallpaper={id}>
      <WallpaperArt id={id} fit={fit} customUrl={customUrl} />
    </div>
  );
}
