import { useState } from 'react';
import { ArrowRight, Check, Moon, Sun } from 'lucide-react';
import { ACCENTS, OS_NAME, OS_TAGLINE } from '@/app/constants';
import { Logo } from '@/components/ui/Logo';
import { useSettings } from '@/stores/settingsStore';
import { useWidgets } from '@/stores/widgetStore';
import { useResolvedTheme } from '@/hooks/useApplySettings';
import { cn } from '@/utils/cn';
import type { AccentId } from '@/types/settings';
import { WallpaperArt } from './Wallpaper';

/** First-run experience: introduce Solace, then choose appearance and a display name. */
export function Welcome() {
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState('');
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const complete = useSettings((s) => s.completeSetup);
  const resolved = useResolvedTheme();
  const theme = settings.theme === 'system' ? resolved : settings.theme;

  const enter = () => {
    complete({ displayName: name });
    if (useWidgets.getState().widgets.length === 0) useWidgets.getState().add('clock', { x: Math.max(36, window.innerWidth - 220 - 40), y: 36 });
  };

  return (
    <div className="fixed inset-0 grid place-items-center overflow-auto p-4 text-ink" data-testid="welcome">
      <div className="absolute inset-0" aria-hidden>
        <WallpaperArt id={theme === 'dark' ? 'eclipse' : 'mist'} />
      </div>
      <div className="s-panel s-anim-pop relative my-auto w-full max-w-[460px] p-8" style={{ background: 'color-mix(in srgb, var(--s-surface) 92%, transparent)' }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={64} className="text-ink" />
          <h1 className="mt-4 mb-1 text-[26px] font-semibold tracking-tight">{step === 0 ? `Welcome to ${OS_NAME}` : 'Make it yours'}</h1>
          <p className="m-0 text-[14px] text-dim">{step === 0 ? OS_TAGLINE : 'Choose how Solace looks and what to call you. You can change everything later in Settings.'}</p>
        </div>

        {step === 0 ? (
          <>
            <ul className="m-0 mb-6 list-none space-y-2.5 p-0 text-[13.5px] text-dim">
              <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> A calm desktop with real windows, a dock and a launcher.</li>
              <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> Files, notes, documents, tasks and a calendar, stored in this browser.</li>
              <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> No account required, and nothing leaves your device unless you choose.</li>
            </ul>
            <button className="s-btn s-btn-primary w-full !h-10" onClick={() => setStep(1)} data-autofocus autoFocus>
              Get started <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enter();
            }}
            className="space-y-5"
          >
            <div>
              <div className="s-label mb-2" id="appearance-label">Appearance</div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="appearance-label">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    role="radio"
                    aria-checked={settings.theme === t}
                    onClick={() => update({ theme: t })}
                    className={cn('flex items-center justify-center gap-2 rounded-[var(--s-radius-sm)] border px-3 py-3 text-[13.5px]', settings.theme === t ? 'border-accent bg-accentsoft' : 'border-line bg-surface2 hover:bg-surface3')}
                  >
                    {t === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                    {t === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="s-label mb-2" id="accent-label">Accent colour</div>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-labelledby="accent-label">
                {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
                  <button
                    type="button"
                    key={id}
                    role="radio"
                    aria-checked={settings.accent === id}
                    aria-label={ACCENTS[id].label}
                    title={ACCENTS[id].label}
                    onClick={() => update({ accent: id })}
                    className="grid h-8 w-8 place-items-center rounded-full border-2"
                    style={{ background: theme === 'dark' ? ACCENTS[id].dark : ACCENTS[id].light, borderColor: settings.accent === id ? 'var(--s-text)' : 'transparent' }}
                  >
                    {settings.accent === id && <Check size={14} style={{ color: 'var(--s-bg)' }} />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="s-label mb-2 block" htmlFor="display-name">Display name <span className="font-normal normal-case tracking-normal">(optional)</span></label>
              <input id="display-name" className="s-input w-full !h-10" placeholder="What should Solace call you?" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />
              <p className="m-0 mt-1.5 text-[12px] text-faint">Stored only in this browser.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="s-btn !h-10" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="submit" className="s-btn s-btn-primary flex-1 !h-10">
                Enter Solace <ArrowRight size={16} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
