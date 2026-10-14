import { useRef, useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { ACCENTS, WALLPAPERS } from '@/app/constants';
import { useSettings } from '@/stores/settingsStore';
import { useResolvedTheme } from '@/hooks/useApplySettings';
import { Group, Row } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { WallpaperArt, useCustomWallpaperUrl } from '@/desktop/Wallpaper';
import { clearCustomWallpaper, saveCustomWallpaper } from '@/services/wallpaperStorage';
import { cn } from '@/utils/cn';
import type { AccentId, BorderStyle, CornerStyle, Density, MotionPref, ThemeMode, WallpaperFit } from '@/types/settings';

export function AppearanceSection() {
  const s = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  const resolved = useResolvedTheme();
  return (
    <>
      <Group title="Theme">
        <Row title="Colour mode" hint="Auto follows your operating system.">
          <Segmented<ThemeMode> label="Colour mode" value={s.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Auto' }]} />
        </Row>
        <Row title="Accent colour" hint="Used for focus, selection and highlights.">
          <div className="flex flex-wrap justify-end gap-2" role="radiogroup" aria-label="Accent colour">
            {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={s.accent === id}
                aria-label={ACCENTS[id].label}
                title={ACCENTS[id].label}
                onClick={() => update({ accent: id })}
                className="grid h-7 w-7 place-items-center rounded-full border-2"
                style={{ background: resolved === 'dark' ? ACCENTS[id].dark : ACCENTS[id].light, borderColor: s.accent === id ? 'var(--s-text)' : 'transparent' }}
              >
                {s.accent === id && <Check size={13} style={{ color: 'var(--s-bg)' }} />}
              </button>
            ))}
          </div>
        </Row>
      </Group>
      <Group title="Windows">
        <Row title="Corner style">
          <Segmented<CornerStyle> label="Corner style" value={s.windows.corners} onChange={(v) => update({ windows: { corners: v } })} options={[{ value: 'sharp', label: 'Sharp' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]} />
        </Row>
        <Row title="Window borders">
          <Segmented<BorderStyle> label="Window borders" value={s.windows.border} onChange={(v) => update({ windows: { border: v } })} options={[{ value: 'none', label: 'None' }, { value: 'subtle', label: 'Subtle' }, { value: 'strong', label: 'Strong' }]} />
        </Row>
      </Group>
      <Group title="Interface">
        <Row title="Density" hint="Controls the size of buttons and inputs.">
          <Segmented<Density> label="Interface density" value={s.density} onChange={(v) => update({ density: v })} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'spacious', label: 'Spacious' }]} />
        </Row>
        <Row title="Motion" hint="Reduce animations and transitions. Auto follows your system setting.">
          <Segmented<MotionPref> label="Motion" value={s.motion} onChange={(v) => update({ motion: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'reduced', label: 'Reduced' }, { value: 'full', label: 'Full' }]} />
        </Row>
      </Group>
    </>
  );
}

const FITS: Array<{ value: WallpaperFit; label: string }> = [
  { value: 'cover', label: 'Fill' },
  { value: 'contain', label: 'Fit' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'center', label: 'Center' },
  { value: 'tile', label: 'Tile' },
];

export function WallpaperSection() {
  const wallpaper = useSettings((st) => st.settings.wallpaper);
  const fit = useSettings((st) => st.settings.wallpaperFit);
  const update = useSettings((st) => st.update);
  const customUrl = useCustomWallpaperUrl(true);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = await saveCustomWallpaper(f);
    if (r.ok) {
      setError(null);
      update({ wallpaper: 'custom' });
    } else setError(r.error);
  };

  const Thumb = ({ id, label }: { id: string; label: string }) => (
    <button
      role="radio"
      aria-checked={wallpaper === id}
      onClick={() => update({ wallpaper: id })}
      className={cn('group flex flex-col gap-1.5 rounded-[var(--s-radius-sm)] border-0 bg-transparent p-0 text-left')}
    >
      <span className={cn('relative block aspect-[16/10] w-full overflow-hidden rounded-[var(--s-radius-sm)] border-2', wallpaper === id ? 'border-accent' : 'border-line group-hover:border-line2')}>
        {id === 'auto' ? (
          <>
            <span className="absolute inset-0 w-1/2 overflow-hidden"><span className="absolute inset-0 w-[200%]"><WallpaperArt id="eclipse" /></span></span>
            <span className="absolute inset-y-0 right-0 w-1/2 overflow-hidden"><span className="absolute inset-y-0 right-0 w-[200%]"><WallpaperArt id="mist" /></span></span>
          </>
        ) : (
          <WallpaperArt id={id} fit={fit} customUrl={customUrl} />
        )}
      </span>
      <span className="text-[12.5px] text-dim">{label}</span>
    </button>
  );

  return (
    <>
      <Group title="Wallpaper">
        <div role="radiogroup" aria-label="Wallpaper" className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 py-3">
          <Thumb id="auto" label="Match theme" />
          {WALLPAPERS.map((w) => <Thumb key={w.id} id={w.id} label={w.label} />)}
          {customUrl && <Thumb id="custom" label="Your image" />}
        </div>
      </Group>
      <Group title="Custom wallpaper">
        <Row title="Upload an image" hint="PNG, JPEG, WebP, GIF or AVIF, up to 8 MB. Stored only in this browser.">
          <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="Choose wallpaper image" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="s-btn" onClick={() => input.current?.click()}><ImagePlus size={14} /> Choose image…</button>
          {customUrl && (
            <button className="s-btn s-btn-danger" onClick={async () => { await clearCustomWallpaper(); if (wallpaper === 'custom') update({ wallpaper: 'auto' }); }}><Trash2 size={14} /> Remove</button>
          )}
        </Row>
        {error && <div role="alert" className="py-2 text-[12.5px] text-danger">{error}</div>}
        <Row title="Position and scaling" hint="Applies to your uploaded image.">
          <Segmented<WallpaperFit> label="Wallpaper fit" value={fit} onChange={(v) => update({ wallpaperFit: v })} options={FITS} />
        </Row>
      </Group>
    </>
  );
}
