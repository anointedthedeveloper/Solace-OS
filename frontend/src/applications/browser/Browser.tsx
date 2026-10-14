import { useState } from 'react';
import { ExternalLink, Globe, History, Plus, Trash2 } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { useBookmarks } from './bookmarksStore';
import { normalizeUrl, hostOf } from '@/utils/url';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSettings } from '@/stores/settingsStore';

const SUGGESTIONS = [
  { title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
  { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' },
];

/** Opens an external site in a new browsing context, severed from Solace (no opener / referrer). */
export function openExternal(url: string): boolean {
  const safe = normalizeUrl(url);
  if (!safe) return false;
  useBookmarks.getState().visit(safe);
  window.open(safe, '_blank', 'noopener,noreferrer');
  return true;
}

export default function Browser(_props: AppComponentProps) {
  const { bookmarks, visits, add, remove, clearVisits } = useBookmarks();
  const rememberRecents = useSettings((s) => s.settings.privacy.rememberRecents);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openExternal(address)) return setError('Enter a valid web address, like example.com or https://example.com.');
    setError(null);
    setAddress('');
  };

  const saveBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    const safe = normalizeUrl(url);
    if (!safe) return setAddError('That doesn’t look like a valid http(s) address.');
    add(title.trim() || hostOf(safe), safe);
    setAdding(false);
    setTitle('');
    setUrl('');
    setAddError(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <form onSubmit={go} className="flex gap-2" role="search">
          <div className="relative min-w-0 flex-1">
            <Globe size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" aria-hidden />
            <input className="s-input w-full !pl-8" placeholder="Enter a web address" aria-label="Web address" aria-invalid={!!error} aria-describedby="browser-hint" value={address} onChange={(e) => { setAddress(e.target.value); setError(null); }} spellCheck={false} />
          </div>
          <button type="submit" className="s-btn s-btn-primary" disabled={!address.trim()}>
            <ExternalLink size={14} /> Open
          </button>
        </form>
        <p id="browser-hint" className={error ? 'm-0 mt-1.5 text-[12px] text-danger' : 'm-0 mt-1.5 text-[12px] text-faint'} role={error ? 'alert' : undefined}>
          {error ?? 'Websites open in a new browser tab, outside Solace. Solace can’t see or control them.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="s-label m-0">Your sites</h2>
          <button className="s-btn !h-7" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Plus size={14} /> Add site
          </button>
        </div>
        {adding && (
          <form onSubmit={saveBookmark} className="mb-3 grid gap-2 rounded-[var(--s-radius)] border border-line bg-surface2 p-3 sm:grid-cols-[1fr_1.5fr_auto]">
            <input className="s-input" placeholder="Name (optional)" aria-label="Site name" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
            <input className="s-input" placeholder="example.com" aria-label="Site address" value={url} onChange={(e) => { setUrl(e.target.value); setAddError(null); }} data-autofocus autoFocus />
            <button type="submit" className="s-btn s-btn-primary">Save</button>
            {addError && <div role="alert" className="text-[12px] text-danger sm:col-span-3">{addError}</div>}
          </form>
        )}

        {bookmarks.length === 0 ? (
          <div>
            <EmptyState icon={Globe} title="No sites saved yet" hint="Add the websites you visit often so they're one click away." />
            <div className="mt-1 text-center text-[12px] text-faint">Suggestions (external sites, saved only if you click):</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s.url} className="s-btn" onClick={() => add(s.title, s.url)}>
                  <Plus size={13} /> {s.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-0">
            {bookmarks.map((b) => (
              <li key={b.id} className="group relative">
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => useBookmarks.getState().visit(b.url)}
                  className="flex h-full flex-col gap-2 rounded-[var(--s-radius)] border border-line bg-surface2 p-3 no-underline hover:bg-surface3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line2 bg-surface3 text-[15px] font-semibold text-ink" aria-hidden>
                    {(b.title[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="truncate text-[13px] text-ink">{b.title}</span>
                  <span className="flex items-center gap-1 truncate text-[11.5px] text-dim">
                    <ExternalLink size={10} aria-hidden /> {hostOf(b.url)}
                    <span className="sr-only"> (external website, opens in a new tab)</span>
                  </span>
                </a>
                <button className="s-icon-btn absolute top-1.5 right-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" aria-label={`Remove ${b.title}`} title="Remove" onClick={() => remove(b.id)}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {rememberRecents && visits.length > 0 && (
          <section className="mt-6" aria-label="Recently opened">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="s-label m-0 flex items-center gap-1.5"><History size={12} /> Recently opened</h2>
              <button className="s-btn s-btn-ghost !h-6 !px-2 text-[12px]" onClick={clearVisits}>Clear</button>
            </div>
            <ul className="m-0 list-none p-0">
              {visits.map((v) => (
                <li key={v.url}>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-[var(--s-radius-sm)] px-2 py-1 text-[12.5px] text-dim no-underline hover:bg-surface3 hover:text-ink">
                    <ExternalLink size={12} aria-hidden /> <span className="truncate">{v.url}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
