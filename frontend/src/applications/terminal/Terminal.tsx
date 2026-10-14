import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppComponentProps } from '../types';
import { APPS } from '../registry';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { OS_NAME, OS_VERSION } from '@/app/constants';
import { complete, runCommand, type TermContext } from './commands';
import { cn } from '@/utils/cn';

interface Line {
  id: number;
  kind: 'in' | 'out' | 'err';
  text: string;
}

export default function Terminal({ windowId }: AppComponentProps) {
  const [lines, setLines] = useState<Line[]>([
    { id: 0, kind: 'out', text: `${OS_NAME} ${OS_VERSION} — Solace Terminal` },
    { id: 1, kind: 'out', text: 'This is a simulated command environment: it understands only Solace\'s own commands and cannot run programs on your computer.' },
    { id: 2, kind: 'out', text: 'Type `help` to see what it can do.' },
  ]);
  const [input, setInput] = useState('');
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const seq = useRef(3);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);

  const ctx = useMemo<TermContext>(
    () => ({
      apps: APPS.map((a) => ({ id: a.id, name: a.name, description: a.description })),
      theme: settings.theme,
      accent: settings.accent,
      displayName: settings.displayName,
      now: () => new Date(),
      startedAt: startedAt.current,
      openApp: (id) => useWindows.getState().openApp(id) !== null,
      openWindows: () => Object.values(useWindows.getState().windows).map((w) => ({ id: w.id, title: w.title, appId: w.appId, minimized: w.minimized })),
      setTheme: (theme) => update({ theme }),
      setAccent: (accent) => update({ accent }),
      storageEstimate: async () => (navigator.storage?.estimate ? navigator.storage.estimate() : null),
    }),
    [settings.theme, settings.accent, settings.displayName, update],
  );

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lines]);
  useEffect(() => inputRef.current?.focus(), [windowId]);

  const push = (kind: Line['kind'], text: string) => setLines((l) => [...l, { id: seq.current++, kind, text }].slice(-500));

  const submit = async () => {
    const line = input;
    setInput('');
    cursor.current = -1;
    push('in', line);
    if (!line.trim()) return;
    history.current = [line, ...history.current.filter((h) => h !== line)].slice(0, 100);
    const res = await runCommand(line, ctx);
    if (res.clear) return setLines([]);
    for (const t of res.lines) push(res.error ? 'err' : 'out', t);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor.current = Math.min(history.current.length - 1, cursor.current + 1);
      setInput(history.current[cursor.current] ?? input);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor.current = Math.max(-1, cursor.current - 1);
      setInput(cursor.current === -1 ? '' : history.current[cursor.current]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const c = complete(input, ctx);
      if (c) setInput(c);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg font-mono text-[13px]" onClick={() => !window.getSelection()?.toString() && inputRef.current?.focus()}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-3" role="log" aria-live="polite" aria-label="Terminal output">
        {lines.map((l) => (
          <div key={l.id} className={cn('break-words whitespace-pre-wrap', l.kind === 'in' ? 'text-ink' : l.kind === 'err' ? 'text-danger' : 'text-dim')}>
            {l.kind === 'in' && <span className="mr-2 text-accent">solace$</span>}
            {l.text}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span className="text-accent" aria-hidden>solace$</span>
        <input
          ref={inputRef}
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-ink outline-none"
          aria-label="Terminal command input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
}
