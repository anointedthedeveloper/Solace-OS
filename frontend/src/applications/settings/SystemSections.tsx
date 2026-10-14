import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { OS_CODENAME, OS_NAME, OS_TAGLINE, OS_VERSION, DEFAULT_SHORTCUTS, SHORTCUTS } from '@/app/constants';
import { useSettings } from '@/stores/settingsStore';
import { useNotes } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents } from '@/stores/eventsStore';
import { useDocs } from '@/stores/docsStore';
import { useFs, usedBytes } from '@/services/fsStore';
import { useLauncher } from '@/stores/launcherStore';
import { useBookmarks } from '../browser/bookmarksStore';
import { useDesktop } from '@/stores/desktopStore';
import { useWidgets } from '@/stores/widgetStore';
import { useWindows } from '@/stores/windowStore';
import { confirmDialog } from '@/stores/uiStore';
import { notify } from '@/stores/notificationStore';
import { Group, Row } from '@/components/ui/Section';
import { Switch } from '@/components/ui/Switch';
import { Logo } from '@/components/ui/Logo';
import { RECORDING_ATTR } from '@/window-manager/useGlobalShortcuts';
import { applyImport, buildExport, eraseAllLocalData, parseImport } from '@/services/dataTransfer';
import { idbAvailable } from '@/services/idb';
import { downloadBlob } from '@/services/localFolder';
import { eventToCombo, isReservedCombo, prettyCombo } from '@/utils/shortcuts';
import { formatBytes } from '@/utils/format';
import type { ShortcutId } from '@/types/settings';

function ShortcutRow({ id, label, description }: { id: ShortcutId; label: string; description: string }) {
  const combo = useSettings((s) => s.settings.shortcuts[id]);
  const shortcuts = useSettings((s) => s.settings.shortcuts);
  const setShortcut = useSettings((s) => s.setShortcut);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    document.body.setAttribute(RECORDING_ATTR, '1');
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRecording(false);
      const c = eventToCombo(e);
      if (!c) return; // modifier only
      if (isReservedCombo(c)) return setError('That combination needs a modifier (Alt, Ctrl or ⌘) and can’t clash with browser shortcuts.');
      const clash = (Object.keys(shortcuts) as ShortcutId[]).find((k) => k !== id && shortcuts[k] === c);
      if (clash) return setError(`Already used by “${SHORTCUTS.find((s) => s.id === clash)?.label}”.`);
      setShortcut(id, c);
      setError(null);
      setRecording(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.removeAttribute(RECORDING_ATTR);
    };
  }, [recording, id, shortcuts, setShortcut]);

  return (
    <Row title={label} hint={error ? <span className="text-danger" role="alert">{error}</span> : description}>
      {recording ? <span className="s-kbd" aria-live="polite">Press keys… (Esc to cancel)</span> : <span className="s-kbd">{prettyCombo(combo)}</span>}
      <button className="s-btn" onClick={() => { setError(null); setRecording((r) => !r); }} aria-label={`Change shortcut for ${label}`}>{recording ? 'Cancel' : 'Change'}</button>
      <button className="s-icon-btn" aria-label={`Reset shortcut for ${label}`} title="Reset to default" disabled={combo === DEFAULT_SHORTCUTS[id]} onClick={() => setShortcut(id, DEFAULT_SHORTCUTS[id])}><RotateCcw size={14} /></button>
    </Row>
  );
}

export function ShortcutsSection() {
  return (
    <Group title="Keyboard shortcuts">
      <p className="m-0 mb-1 text-[12.5px] text-dim">Shortcuts use Alt by default so they don’t collide with your browser’s own commands. Click Change, then press the new combination.</p>
      {SHORTCUTS.map((s) => <ShortcutRow key={s.id} {...s} />)}
    </Group>
  );
}

export function WorkspaceSection() {
  const s = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  return (
    <>
      <Group title="Workspace">
        <Row title="Restore windows on startup" hint="Reopen your windows, in the same places, after a refresh."><Switch label="Restore windows on startup" checked={s.windows.restoreOnStartup} onChange={(v) => update({ windows: { restoreOnStartup: v } })} /></Row>
        <Row title="Snap windows to screen edges" hint="Drag to the top to maximize, or to the left/right edge to tile."><Switch label="Snap windows to screen edges" checked={s.windows.snapToEdges} onChange={(v) => update({ windows: { snapToEdges: v } })} /></Row>
        <Row title="Close all windows"><button className="s-btn" onClick={() => useWindows.getState().closeAll()}>Close all</button></Row>
      </Group>
      <Group title="Clock">
        <Row title="12-hour clock"><Switch label="12-hour clock" checked={s.clock.hour12} onChange={(v) => update({ clock: { hour12: v } })} /></Row>
        <Row title="Show seconds"><Switch label="Show seconds" checked={s.clock.showSeconds} onChange={(v) => update({ clock: { showSeconds: v } })} /></Row>
      </Group>
      <Group title="Text Editor">
        <Row title="Autosave documents" hint="Save documents a moment after you stop typing."><Switch label="Autosave documents" checked={s.editor.autosave} onChange={(v) => update({ editor: { autosave: v } })} /></Row>
      </Group>
    </>
  );
}

export function PrivacySection() {
  const remember = useSettings((s) => s.settings.privacy.rememberRecents);
  const update = useSettings((s) => s.update);
  return (
    <>
      <Group title="Privacy">
        <Row title="Remember recently opened apps and sites" hint="Used for the launcher's Recent list and the Web start page."><Switch label="Remember recents" checked={remember} onChange={(v) => update({ privacy: { rememberRecents: v } })} /></Row>
        <Row title="Clear recents now"><button className="s-btn" onClick={() => { useLauncher.getState().clear(); useBookmarks.getState().clearVisits(); notify({ title: 'Recents cleared', appId: 'settings' }); }}>Clear</button></Row>
      </Group>
      <Group title="What Solace can access">
        <ul className="m-0 space-y-2 pl-5 text-[13px] text-dim">
          <li>Everything you create is stored <strong className="text-ink">in this browser</strong> on this device. Nothing is sent to a server in guest mode.</li>
          <li>Solace only reads files or folders on your computer when you pick them in the browser’s own dialog.</li>
          <li>Solace never requests your camera, microphone, location or clipboard.</li>
          <li>Websites you open from Solace load in a separate tab, with no link back to Solace.</li>
        </ul>
      </Group>
    </>
  );
}

export function StorageSection() {
  const entries = useFs((s) => s.entries);
  const notes = useNotes((s) => s.notes.length);
  const tasks = useTasks((s) => s.tasks.length);
  const events = useEvents((s) => s.events.length);
  const docs = useDocs((s) => s.docs.length);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [importState, setImportState] = useState<{ text: string; counts: Record<string, number> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void useFs.getState().load();
    if (navigator.storage?.estimate) void navigator.storage.estimate().then(setEstimate).catch(() => undefined);
  }, []);

  const onPick = async (f: File | undefined) => {
    if (!f) return;
    setImportError(null);
    setImportState(null);
    if (f.size > 20 * 1024 * 1024) return setImportError('That file is too large to import.');
    const text = await f.text();
    const r = parseImport(text);
    if (!r.ok) return setImportError(r.error);
    setImportState({ text, counts: r.counts });
  };

  const doImport = async () => {
    if (!importState) return;
    const ok = await confirmDialog({ title: 'Replace your data?', message: 'Importing replaces your current notes, tasks, events, documents, widgets, bookmarks and settings with the contents of the file. This can’t be undone.', confirmLabel: 'Replace my data', danger: true });
    if (!ok) return;
    const r = parseImport(importState.text);
    if (r.ok) {
      applyImport(r.bundle);
      setImportState(null);
      notify({ title: 'Import complete', body: Object.entries(r.counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', '), level: 'success', appId: 'settings' });
    }
  };

  return (
    <>
      <Group title="Storage">
        <Row title="Where your data lives" hint={idbAvailable() ? 'In this browser (IndexedDB and localStorage). Clearing site data in your browser deletes it.' : 'This browser blocked IndexedDB, so data is kept in memory only and will be lost on refresh.'}>
          <span className="text-[12.5px] text-dim">{estimate?.usage !== undefined ? `${formatBytes(estimate.usage)} used${estimate.quota ? ` of ~${formatBytes(estimate.quota)}` : ''}` : 'Usage unavailable'}</span>
        </Row>
        <Row title="Solace Files">{formatBytes(usedBytes(entries))}</Row>
        <Row title="Notes">{notes}</Row>
        <Row title="Tasks">{tasks}</Row>
        <Row title="Calendar events">{events}</Row>
        <Row title="Text documents">{docs}</Row>
      </Group>
      <Group title="Export & import">
        <Row title="Export your data" hint="Downloads a JSON file with settings, notes, tasks, events, documents, widgets and bookmarks. Files are exported from the Files app.">
          <button className="s-btn" onClick={() => downloadBlob(new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' }), `solace-os-export-${new Date().toISOString().slice(0, 10)}.json`)}><Download size={14} /> Export</button>
        </Row>
        <Row title="Import from a Solace export" hint="You'll see what the file contains before anything is replaced.">
          <input ref={input} type="file" accept="application/json,.json" hidden aria-label="Choose a Solace export file" onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="s-btn" onClick={() => input.current?.click()}><Upload size={14} /> Choose file…</button>
        </Row>
        {importError && <div role="alert" className="py-2 text-[12.5px] text-danger">{importError}</div>}
        {importState && (
          <div className="mt-2 rounded-[var(--s-radius-sm)] border border-line bg-surface2 p-3 text-[12.5px]">
            <div className="mb-1 text-ink">This file contains:</div>
            <div className="text-dim">{Object.entries(importState.counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ')}</div>
            <div className="mt-2 flex gap-2"><button className="s-btn s-btn-primary" onClick={() => void doImport()}>Import…</button><button className="s-btn" onClick={() => setImportState(null)}>Cancel</button></div>
          </div>
        )}
      </Group>
    </>
  );
}

export function ResetSection() {
  return (
    <Group title="Reset">
      <Row title="Restore default settings" hint="Resets appearance, dock, shortcuts and behaviour. Your files, notes and other data are kept.">
        <button
          className="s-btn"
          onClick={async () => {
            if (await confirmDialog({ title: 'Restore default settings?', message: 'Appearance, dock, desktop, widgets visibility and keyboard shortcuts will return to their defaults. Your data is not affected.', confirmLabel: 'Restore defaults' })) {
              useSettings.getState().resetDefaults();
              useDesktop.getState().reset(6);
              useWidgets.getState().clear();
              notify({ title: 'Default settings restored', appId: 'settings' });
            }
          }}
        >
          <RotateCcw size={14} /> Restore defaults
        </button>
      </Row>
      <Row title="Erase all local data" hint="Permanently deletes everything Solace stores in this browser — files, notes, tasks, events, documents and settings — and returns to the welcome screen.">
        <button
          className="s-btn s-btn-danger"
          onClick={async () => {
            if (await confirmDialog({ title: 'Erase everything?', message: 'All Solace data in this browser will be permanently deleted. Consider exporting your data first. This can’t be undone.', confirmLabel: 'Erase everything', danger: true })) void eraseAllLocalData();
          }}
        >
          <Trash2 size={14} /> Erase data…
        </button>
      </Row>
    </Group>
  );
}

export function AboutSection() {
  return (
    <>
      <div className="flex items-center gap-4 py-4">
        <Logo size={64} className="text-ink" />
        <div>
          <div className="text-[20px] font-semibold">{OS_NAME}</div>
          <div className="text-[13px] text-dim">{OS_TAGLINE}</div>
          <div className="mt-1 text-[12px] text-faint">Version {OS_VERSION} “{OS_CODENAME}”</div>
        </div>
      </div>
      <Group title="Environment">
        <Row title="Browser">{navigator.userAgent.split(' ').slice(-2).join(' ')}</Row>
        <Row title="Screen">{window.screen.width} × {window.screen.height}</Row>
        <Row title="Language">{navigator.language}</Row>
        <Row title="Online">{navigator.onLine ? 'Yes' : 'No'}</Row>
      </Group>
      <p className="text-[12.5px] text-dim">Solace OS is a desktop environment that runs entirely in your browser. It is an independent project and is not affiliated with any operating-system vendor.</p>
    </>
  );
}
