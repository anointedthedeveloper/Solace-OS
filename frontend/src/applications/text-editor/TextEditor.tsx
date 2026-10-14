import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FilePlus2, FileText, FolderOpen, HardDriveDownload, Replace, Save, Search, X } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { isDirty, useDocs, type SolaceDoc } from '@/stores/docsStore';
import { useSettings } from '@/stores/settingsStore';
import { choiceDialog, confirmDialog, promptDialog, useUi } from '@/stores/uiStore';
import { notify } from '@/stores/notificationStore';
import { useFs, validateName } from '@/services/fsStore';
import { downloadBlob, openTextFromComputer, saveTextToComputer } from '@/services/localFolder';
import { registerCloseGuard } from '@/services/closeGuards';
import { EmptyState } from '@/components/ui/EmptyState';
import { countWords } from '@/utils/format';
import { cn } from '@/utils/cn';
import { findMatches, lineCol, replaceAllMatches } from './logic';

/** File handles for documents opened from / saved to the user's computer. Memory-only by design. */
const localHandles = new Map<string, unknown>();

async function persistLinkedFile(doc: SolaceDoc) {
  if (!doc.fileId) return;
  try {
    await useFs.getState().writeText(doc.fileId, useDocs.getState().docs.find((d) => d.id === doc.id)?.content ?? doc.content);
  } catch (e) {
    notify({ title: 'Could not update file', body: e instanceof Error ? e.message : 'Saving to Solace Files failed.', level: 'error', appId: 'files' });
  }
}

export default function TextEditor({ windowId, props }: AppComponentProps) {
  const docs = useDocs((s) => s.docs);
  const openIds = useDocs((s) => s.openIds);
  const activeId = useDocs((s) => s.activeId);
  const autosave = useSettings((s) => s.settings.editor.autosave);
  const updateSettings = useSettings((s) => s.update);
  const store = useDocs.getState();
  const openDocs = useMemo(() => openIds.map((id) => docs.find((d) => d.id === id)).filter((d): d is SolaceDoc => !!d), [openIds, docs]);
  const active = docs.find((d) => d.id === activeId) ?? null;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [wrap, setWrap] = useState(true);
  const [pos, setPos] = useState({ line: 1, col: 1 });
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const navigated = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => (active ? findMatches(active.content, query, caseSensitive) : []), [active, query, caseSensitive]);

  /* ── launch parameters ─────────────────────────────────────────── */
  useEffect(() => {
    if (typeof props.docId === 'string') useDocs.getState().openTab(props.docId);
  }, [props.docId]);
  useEffect(() => {
    const fileId = props.fileId;
    if (typeof fileId !== 'string') return;
    const existing = useDocs.getState().docs.find((d) => d.fileId === fileId);
    if (existing) return useDocs.getState().openTab(existing.id);
    void (async () => {
      const fs = useFs.getState();
      await fs.load();
      const entry = useFs.getState().entries[fileId];
      const blob = entry ? await fs.readBlob(fileId) : null;
      if (!entry || !blob) return setError('That file could not be found.');
      try {
        const { readTextSafely } = await import('@/services/localFolder');
        useDocs.getState().create({ name: entry.name, content: await readTextSafely(blob), fileId });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open that file.');
      }
    })();
  }, [props.fileId, props.at]);

  /* ── saving ────────────────────────────────────────────────────── */
  const saveDoc = useCallback(async (id: string, interactive: boolean): Promise<boolean> => {
    const s = useDocs.getState();
    let doc = s.docs.find((d) => d.id === id);
    if (!doc) return true;
    if (interactive && doc.untitled) {
      const name = await promptDialog({ title: 'Save document', label: 'Document name', initial: doc.name, confirmLabel: 'Save', validate: validateName });
      if (name === null) return false;
      s.rename(id, name.trim());
    }
    s.save(id);
    doc = useDocs.getState().docs.find((d) => d.id === id)!;
    await persistLinkedFile(doc);
    return true;
  }, []);

  // Autosave: after a short pause, save every open dirty document.
  useEffect(() => {
    if (!autosave) return;
    const t = setTimeout(() => {
      for (const d of useDocs.getState().docs) if (useDocs.getState().openIds.includes(d.id) && isDirty(d)) void saveDoc(d.id, false);
    }, 1200);
    return () => clearTimeout(t);
  }, [docs, autosave, saveDoc]);

  /* ── closing & unsaved-changes protection ──────────────────────── */
  const resolveDirty = useCallback(async (dirty: SolaceDoc[]): Promise<boolean> => {
    if (dirty.length === 0) return true;
    const names = dirty.map((d) => `“${d.name}”`).join(', ');
    const res = await choiceDialog({
      title: 'Save changes?',
      message: dirty.length === 1 ? `${names} has unsaved changes.` : `${dirty.length} documents have unsaved changes: ${names}.`,
      confirmLabel: dirty.length === 1 ? 'Save' : 'Save all',
      altLabel: "Don't save",
    });
    if (res === 'cancel') return false;
    for (const d of dirty) {
      if (res === 'confirm') {
        if (!(await saveDoc(d.id, true))) return false;
      } else {
        const cur = useDocs.getState().docs.find((x) => x.id === d.id);
        if (cur && cur.untitled && !cur.savedContent) useDocs.getState().remove(d.id);
        else useDocs.getState().discardDraft(d.id);
      }
    }
    return true;
  }, [saveDoc]);

  useEffect(
    () =>
      registerCloseGuard(windowId, () => {
        const s = useDocs.getState();
        return resolveDirty(s.docs.filter((d) => s.openIds.includes(d.id) && isDirty(d)));
      }),
    [windowId, resolveDirty],
  );

  const closeTab = async (doc: SolaceDoc) => {
    if (isDirty(doc) && !(await resolveDirty([doc]))) return;
    localHandles.delete(doc.id);
    useDocs.getState().closeTab(doc.id);
  };

  /* ── actions ───────────────────────────────────────────────────── */
  const openFromComputer = async () => {
    setError(null);
    try {
      const f = await openTextFromComputer();
      if (!f) return;
      const id = store.create({ name: f.name, content: f.text });
      if (f.handle) localHandles.set(id, f.handle);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const saveToComputer = async () => {
    if (!active) return;
    setError(null);
    try {
      const r = await saveTextToComputer(active.name, active.content, localHandles.get(active.id));
      if (r?.handle) localHandles.set(active.id, r.handle);
      if (r) {
        useDocs.getState().save(active.id);
        notify({ title: 'Saved to your computer', body: r.handle ? r.name : `${r.name} was downloaded.`, appId: 'editor' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save to your computer.');
    }
  };

  const openMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const closed = docs.filter((d) => !openIds.includes(d.id)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    useUi.getState().openMenu(rect.left, rect.bottom + 4, [
      { label: 'From this computer…', icon: HardDriveDownload, onSelect: () => void openFromComputer() },
      { separator: true },
      ...(closed.length ? closed.map((d) => ({ label: d.name, icon: FileText, onSelect: () => useDocs.getState().openTab(d.id) })) : [{ label: 'No other Solace documents', disabled: true }]),
    ]);
  };

  const tabMenu = (e: React.MouseEvent, d: SolaceDoc) => {
    e.preventDefault();
    useUi.getState().openMenu(e.clientX, e.clientY, [
      { label: 'Rename…', onSelect: async () => { const n = await promptDialog({ title: 'Rename document', label: 'Name', initial: d.name, validate: validateName, confirmLabel: 'Rename' }); if (n) useDocs.getState().rename(d.id, n.trim()); } },
      { label: 'Close', onSelect: () => void closeTab(d) },
      { separator: true },
      { label: 'Delete document…', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Delete document?', message: `“${d.name}” will be permanently deleted from Solace.`, confirmLabel: 'Delete', danger: true })) { localHandles.delete(d.id); useDocs.getState().remove(d.id); } } },
    ]);
  };

  /* ── find / replace ────────────────────────────────────────────── */
  const gotoMatch = useCallback((i: number) => {
    if (!matches.length || !taRef.current) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    setMatchIdx(idx);
    const ta = taRef.current;
    ta.focus();
    ta.setSelectionRange(matches[idx], matches[idx] + query.length);
    // Bring the selection into view without a heavy measuring pass.
    const lines = ta.value.slice(0, matches[idx]).split('\n').length;
    ta.scrollTop = Math.max(0, (lines - 4) * 20);
  }, [matches, query]);

  useEffect(() => {
    setMatchIdx(0);
    navigated.current = false;
  }, [query, caseSensitive, activeId]);

  const onEditorKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyS') {
      e.preventDefault();
      if (active) void saveDoc(active.id, true);
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyF') {
      e.preventDefault();
      setFindOpen(true);
    } else if (e.key === 'Escape' && findOpen) {
      e.stopPropagation();
      setFindOpen(false);
      taRef.current?.focus();
    }
  };

  const updatePos = () => {
    const ta = taRef.current;
    if (ta) setPos(lineCol(ta.value, ta.selectionStart));
  };

  return (
    <div className="flex h-full flex-col" onKeyDown={onEditorKey}>
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
        <button className="s-btn !h-7" onClick={() => store.create()} aria-label="New document"><FilePlus2 size={14} /> New</button>
        <button className="s-btn !h-7" onClick={openMenu} aria-haspopup="menu"><FolderOpen size={14} /> Open <ChevronDown size={12} /></button>
        <button className="s-btn !h-7" onClick={() => active && void saveDoc(active.id, true)} disabled={!active || !isDirty(active)} aria-label="Save"><Save size={14} /> Save</button>
        <button className="s-btn !h-7" onClick={() => void saveToComputer()} disabled={!active} title="Save a copy to a file on your computer" aria-label="Save to computer"><HardDriveDownload size={14} /> Save to computer</button>
        <button className="s-btn !h-7" disabled={!active} aria-label="Download" title="Download as a text file" onClick={() => active && downloadBlob(new Blob([active.content], { type: 'text/plain;charset=utf-8' }), active.name)}><Download size={14} /></button>
        <div className="ml-auto flex items-center gap-3 text-[12px] text-dim">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--s-accent)]" checked={autosave} onChange={(e) => updateSettings({ editor: { autosave: e.target.checked } })} /> Autosave</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--s-accent)]" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap</label>
          <button className={cn('s-icon-btn', findOpen && '!bg-accentsoft !text-accent')} aria-label="Find in document" aria-pressed={findOpen} title="Find (Ctrl+F)" onClick={() => setFindOpen((v) => !v)}><Search size={15} /></button>
        </div>
      </div>

      {openDocs.length > 0 && (
        <div role="tablist" aria-label="Open documents" className="flex min-h-[34px] overflow-x-auto border-b border-line bg-chrome">
          {openDocs.map((d) => {
            const dirty = isDirty(d);
            return (
              <div key={d.id} className={cn('group flex shrink-0 items-center border-r border-line', d.id === activeId ? 'bg-surface' : 'hover:bg-surface3')} onContextMenu={(e) => tabMenu(e, d)}>
                <button role="tab" aria-selected={d.id === activeId} className="flex max-w-[200px] items-center gap-1.5 border-0 bg-transparent py-1.5 pr-1 pl-3 text-[12.5px]" onClick={() => store.openTab(d.id)} title={d.name}>
                  <span className="truncate">{d.name}</span>
                  {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unsaved changes" />}
                </button>
                <button className="s-icon-btn !h-5 !w-5 mr-1" aria-label={`Close ${d.name}`} onClick={() => void closeTab(d)}><X size={12} /></button>
              </div>
            );
          })}
        </div>
      )}

      {findOpen && active && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface2 px-2 py-1.5" role="search" aria-label="Find in document">
          <input className="s-input !h-7 w-44" placeholder="Find" aria-label="Find" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gotoMatch(navigated.current ? matchIdx + (e.shiftKey ? -1 : 1) : 0); navigated.current = true; } }} autoFocus />
          <span className="min-w-[70px] text-[12px] text-dim" aria-live="polite">{query ? (matches.length ? `${Math.min(matchIdx + 1, matches.length)} of ${matches.length}` : 'No matches') : ''}</span>
          <button className="s-icon-btn" aria-label="Previous match" disabled={!matches.length} onClick={() => { gotoMatch(navigated.current ? matchIdx - 1 : matches.length - 1); navigated.current = true; }}><ChevronUp size={15} /></button>
          <button className="s-icon-btn" aria-label="Next match" disabled={!matches.length} onClick={() => { gotoMatch(navigated.current ? matchIdx + 1 : 0); navigated.current = true; }}><ChevronDown size={15} /></button>
          <label className="flex items-center gap-1 text-[12px] text-dim"><input type="checkbox" className="accent-[var(--s-accent)]" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Match case</label>
          <button className={cn('s-icon-btn', replaceOpen && '!bg-accentsoft !text-accent')} aria-label="Toggle replace" aria-pressed={replaceOpen} onClick={() => setReplaceOpen((v) => !v)}><Replace size={15} /></button>
          {replaceOpen && (
            <>
              <input className="s-input !h-7 w-36" placeholder="Replace with" aria-label="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
              <button
                className="s-btn !h-7"
                disabled={!matches.length}
                onClick={() => {
                  const r = replaceAllMatches(active.content, query, replacement, caseSensitive);
                  store.edit(active.id, r.text);
                  notify({ title: 'Replaced', body: `${r.count} occurrence${r.count === 1 ? '' : 's'} replaced.`, appId: 'editor' });
                }}
              >
                Replace all
              </button>
            </>
          )}
          <button className="s-icon-btn ml-auto" aria-label="Close find" onClick={() => setFindOpen(false)}><X size={14} /></button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-1.5 text-[12.5px] text-danger">
          {error}
          <button className="s-icon-btn" aria-label="Dismiss error" onClick={() => setError(null)}><X size={13} /></button>
        </div>
      )}

      {active ? (
        <>
          <textarea
            key={active.id}
            ref={taRef}
            aria-label={`Editing ${active.name}`}
            className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-[13.5px] leading-[20px] outline-none focus-visible:outline-none"
            style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowWrap: wrap ? 'anywhere' : 'normal', tabSize: 2 }}
            spellCheck={false}
            value={active.content}
            onChange={(e) => { store.edit(active.id, e.target.value); updatePos(); }}
            onKeyUp={updatePos}
            onClick={updatePos}
            onSelect={updatePos}
          />
          <div className="flex items-center justify-between border-t border-line px-3 py-1 text-[11.5px] text-faint">
            <span>Ln {pos.line}, Col {pos.col}</span>
            <span>{countWords(active.content)} words · {active.content.length} characters</span>
            <span aria-live="polite">{isDirty(active) ? (autosave ? 'Saving…' : 'Unsaved changes') : active.fileId ? 'Saved · linked to Solace Files' : 'Saved in this browser'}</span>
          </div>
        </>
      ) : (
        <EmptyState icon={FileText} title="No document open" hint="Create a new document, or open one from Solace or your computer." action={<button className="s-btn s-btn-primary" onClick={() => store.create()}>New document</button>} />
      )}
    </div>
  );
}
