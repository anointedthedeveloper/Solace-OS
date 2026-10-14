import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Clipboard, Copy, Download, FilePlus2, FolderOpen, FolderPlus, Grid2x2, HardDrive, Home, Info, List, Monitor, Pencil, Scissors,
  Search, Trash2, Undo2, Upload, X,
} from 'lucide-react';
import type { AppComponentProps } from '../types';
import { useWindows } from '@/stores/windowStore';
import { useDocs } from '@/stores/docsStore';
import { confirmDialog, promptDialog, useUi, type MenuItem } from '@/stores/uiStore';
import { notify } from '@/stores/notificationStore';
import { FsError, ROOT_ID, childrenOf, isReachable, isTextLike, pathOf, usedBytes, useFs, validateName } from '@/services/fsStore';
import { downloadBlob, folderAccessSupported, listFolder, pickFolder, readTextSafely, type LocalDir, type LocalFile, type LocalListing } from '@/services/localFolder';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { VirtualList } from '@/components/ui/VirtualList';
import { formatBytes, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { useFileClipboard } from './clipboard';
import { iconFor, itemKind, matchesType, rangeIds, sortItems, toItem, typeLabel, type Item, type Location, type SortKey, type TypeFilter } from './logic';

const VIEW_KEY = 'solace.files.view';
const readView = (): 'list' | 'grid' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};

interface ComputerState {
  root: LocalDir | null;
  path: LocalDir[];
  listing: LocalListing[];
  sizes: Record<string, { size: number; modified: number; mime: string }>;
  loading: boolean;
  error: string | null;
}

function ImagePreview({ item, getBlob, onClose }: { item: Item; getBlob: () => Promise<Blob | null>; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const getBlobRef = useRef(getBlob);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    void getBlobRef.current().then((b) => {
      if (!alive) return;
      if (!b) return setFailed(true);
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, []);
  return (
    <Modal title={item.name} onClose={onClose} width={720} footer={<button className="s-btn" onClick={onClose}>Close</button>}>
      <div className="grid min-h-48 place-items-center">
        {failed ? <p>This image could not be loaded.</p> : url ? <img src={url} alt={item.name} className="max-h-[60vh] max-w-full object-contain" /> : <p>Loading…</p>}
      </div>
    </Modal>
  );
}

export default function FileManager({ props }: AppComponentProps) {
  const entries = useFs((s) => s.entries);
  const loaded = useFs((s) => s.loaded);
  const fs = useFs.getState();
  const clip = useFileClipboard();

  const [loc, setLoc] = useState<Location>({ kind: 'solace', folderId: ROOT_ID });
  const [hist, setHist] = useState<Location[]>([{ kind: 'solace', folderId: ROOT_ID }]);
  const [hi, setHi] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [view, setView] = useState<'list' | 'grid'>(readView);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [details, setDetails] = useState(false);
  const [preview, setPreview] = useState<Item | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [computer, setComputer] = useState<ComputerState>({ root: null, path: [], listing: [], sizes: {}, loading: false, error: null });
  const fileInput = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(600);
  const [focusIndex, setFocusIndex] = useState(-1);

  useEffect(() => void fs.load(), [fs]);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneWidth(el.clientWidth));
    setPaneWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  useEffect(() => {
    if (typeof props.folderId === 'string' && entries[props.folderId]) go({ kind: 'solace', folderId: props.folderId });
    else if (props.location === 'trash') go({ kind: 'trash' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.folderId, props.location, props.at, loaded]);

  const go = useCallback(
    (next: Location) => {
      setLoc(next);
      setHist((h) => [...h.slice(0, hi + 1), next]);
      setHi((i) => i + 1);
      setSel(new Set());
      setSearch('');
      anchor.current = null;
      setFocusIndex(-1);
    },
    [hi],
  );
  const jump = (i: number) => {
    setHi(i);
    setLoc(hist[i]);
    setSel(new Set());
    setSearch('');
  };

  /* ── current folder & items ────────────────────────────────────── */
  const currentFolderId = loc.kind === 'solace' ? loc.folderId : null;
  const searching = search.trim().length > 0;

  const items: Item[] = useMemo(() => {
    let base: Item[] = [];
    const q = search.trim().toLowerCase();
    if (loc.kind === 'computer') {
      base = computer.listing.map((l) => {
        const meta = computer.sizes[l.name];
        return { id: l.name, name: l.name, kind: l.kind, size: l.kind === 'file' ? (meta?.size ?? null) : null, modified: meta?.modified ?? null, mime: meta?.mime ?? '' };
      });
      if (q) base = base.filter((i) => i.name.toLowerCase().includes(q));
    } else if (loc.kind === 'trash') {
      base = Object.values(entries).filter((e) => e.trashedAt !== null && (!q || e.name.toLowerCase().includes(q))).map((e) => toItem(e));
    } else if (searching) {
      base = Object.values(entries)
        .filter((e) => e.id !== ROOT_ID && e.name.toLowerCase().includes(q) && isReachable(entries, e))
        .map((e) => toItem(e, pathOf(entries, e.parentId ?? ROOT_ID).map((p) => p.name).join(' / ')));
    } else if (currentFolderId) {
      base = childrenOf(entries, currentFolderId).map((e) => toItem(e));
    }
    return sortItems(base.filter((i) => matchesType(i, typeFilter)), sortKey, sortDir);
  }, [loc, entries, computer, search, searching, currentFolderId, typeFilter, sortKey, sortDir]);

  const selectedItems = items.filter((i) => sel.has(i.id));
  const writable = loc.kind === 'solace' && !searching;
  const trashCount = Object.values(entries).filter((e) => e.trashedAt !== null).length;

  /* ── helpers ───────────────────────────────────────────────────── */
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify({ title: 'File operation failed', body: e instanceof FsError || e instanceof Error ? e.message : 'Something went wrong.', level: 'error', appId: 'files' });
    } finally {
      setBusy(null);
    }
  };

  const getBlobFor = useCallback(
    async (i: Item): Promise<Blob | null> => {
      if (loc.kind === 'computer') {
        const l = computer.listing.find((x) => x.name === i.id);
        return l && l.kind === 'file' ? (l.handle as LocalFile).getFile() : null;
      }
      return useFs.getState().readBlob(i.id);
    },
    [loc.kind, computer.listing],
  );

  const open = async (i: Item) => {
    if (i.kind === 'folder') {
      if (loc.kind === 'computer') {
        const l = computer.listing.find((x) => x.name === i.id);
        if (l) void enterComputerDir(l.handle as LocalDir);
      } else if (loc.kind === 'trash') {
        notify({ title: 'Restore to open', body: 'Items in the Trash can’t be opened. Restore the folder first.', appId: 'files' });
      } else go({ kind: 'solace', folderId: i.id });
      return;
    }
    const kind = itemKind(i);
    if (kind === 'image') return setPreview(i);
    if (loc.kind === 'trash') return notify({ title: 'Restore to open', body: 'Items in the Trash can’t be opened. Restore the file first.', appId: 'files' });
    if (kind === 'text' || isTextLike({ mime: i.mime, name: i.name })) {
      if (loc.kind === 'computer') {
        await run('Opening…', async () => {
          const blob = await getBlobFor(i);
          if (!blob) throw new Error('Could not read that file.');
          useDocs.getState().create({ name: i.name, content: await readTextSafely(blob) });
          useWindows.getState().openApp('editor');
        });
      } else useWindows.getState().openApp('editor', { props: { fileId: i.id, at: Date.now() } });
      return;
    }
    notify({ title: 'No built-in viewer', body: `${i.name} can’t be previewed in Solace. Use Download to open it with another app.`, appId: 'files' });
  };

  const download = async (list: Item[]) => {
    const files = list.filter((i) => i.kind === 'file');
    if (files.length === 0) return notify({ title: 'Nothing to download', body: 'Folders can’t be downloaded directly.', appId: 'files' });
    await run('Preparing download…', async () => {
      for (const f of files) {
        const blob = await getBlobFor(f);
        if (blob) downloadBlob(blob, f.name);
      }
    });
  };

  const newFolder = async () => {
    if (!currentFolderId) return;
    const name = await promptDialog({ title: 'New folder', label: 'Folder name', initial: 'New folder', confirmLabel: 'Create', validate: validateName });
    if (name) await run('Creating…', async () => void (await fs.createFolder(currentFolderId, name)));
  };
  const newTextFile = async () => {
    if (!currentFolderId) return;
    const name = await promptDialog({ title: 'New text file', label: 'File name', initial: 'Untitled.txt', confirmLabel: 'Create', validate: validateName });
    if (name) await run('Creating…', async () => void (await fs.createTextFile(currentFolderId, name, '')));
  };
  const rename = async (i: Item) => {
    const name = await promptDialog({ title: 'Rename', label: 'New name', initial: i.name, confirmLabel: 'Rename', validate: validateName });
    if (name && name.trim() !== i.name) await run('Renaming…', () => fs.rename(i.id, name));
  };
  const trash = async (list: Item[]) => {
    if (!list.length) return;
    await run('Moving to Trash…', () => fs.trash(list.map((i) => i.id)));
    setSel(new Set());
  };
  const deleteForever = async (list: Item[]) => {
    if (!list.length) return;
    const ok = await confirmDialog({
      title: 'Delete permanently?',
      message: list.length === 1 ? `“${list[0].name}” will be permanently deleted. This can't be undone.` : `${list.length} items will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (ok) {
      await run('Deleting…', () => fs.deleteForever(list.map((i) => i.id)));
      setSel(new Set());
    }
  };
  const emptyTrash = async () => {
    if (trashCount === 0) return;
    if (await confirmDialog({ title: 'Empty Trash?', message: `All ${trashCount} item${trashCount === 1 ? '' : 's'} in the Trash will be permanently deleted. This can't be undone.`, confirmLabel: 'Empty Trash', danger: true })) {
      await run('Emptying Trash…', async () => void (await fs.emptyTrash()));
      setSel(new Set());
    }
  };
  const paste = async () => {
    if (!currentFolderId || !clip.mode || clip.ids.length === 0) return;
    const ids = clip.ids.filter((id) => entries[id]);
    await run(clip.mode === 'cut' ? 'Moving…' : 'Copying…', async () => {
      if (clip.mode === 'cut') {
        await fs.move(ids, currentFolderId);
        clip.clear();
      } else await fs.copy(ids, currentFolderId);
    });
  };
  const upload = async (files: File[]) => {
    if (!currentFolderId || files.length === 0) return;
    await run('Uploading…', async () => {
      const r = await fs.importFiles(currentFolderId, files);
      if (r.added.length) notify({ title: 'Upload complete', body: `${r.added.length} file${r.added.length === 1 ? '' : 's'} added to Solace Files.`, level: 'success', appId: 'files' });
      if (r.rejected.length) notify({ title: `${r.rejected.length} file${r.rejected.length === 1 ? '' : 's'} not uploaded`, body: r.rejected.map((x) => `${x.name}: ${x.reason}`).join('\n'), level: 'warning', appId: 'files' });
    });
  };
  const importFromComputer = async (list: Item[]) => {
    const files = list.filter((i) => i.kind === 'file');
    if (!files.length) return;
    await run('Importing…', async () => {
      const docs = Object.values(entries).find((e) => e.parentId === ROOT_ID && e.name === 'Documents' && e.trashedAt === null);
      const dest = docs?.id ?? ROOT_ID;
      const blobs: File[] = [];
      for (const f of files) {
        const l = computer.listing.find((x) => x.name === f.id);
        if (l && l.kind === 'file') blobs.push(await (l.handle as LocalFile).getFile());
      }
      const r = await fs.importFiles(dest, blobs);
      notify({ title: 'Imported to Solace Files', body: `${r.added.length} file${r.added.length === 1 ? '' : 's'} copied into Documents.${r.rejected.length ? ` ${r.rejected.length} skipped.` : ''}`, level: r.added.length ? 'success' : 'warning', appId: 'files' });
    });
  };

  /* ── computer folder ───────────────────────────────────────────── */
  const loadComputer = useCallback(async (dir: LocalDir) => {
    setComputer((c) => ({ ...c, loading: true, error: null }));
    try {
      const listing = await listFolder(dir);
      setComputer((c) => ({ ...c, listing, sizes: {}, loading: false }));
      // Size/modified need a per-file read; do it lazily for a bounded number of files.
      const files = listing.filter((l) => l.kind === 'file').slice(0, 300);
      const sizes: ComputerState['sizes'] = {};
      for (const f of files) {
        try {
          const file = await (f.handle as LocalFile).getFile();
          sizes[f.name] = { size: file.size, modified: file.lastModified, mime: file.type };
        } catch {
          /* unreadable entry — leave blank */
        }
      }
      setComputer((c) => (c.listing === listing ? { ...c, sizes } : c));
    } catch (e) {
      setComputer((c) => ({ ...c, loading: false, error: e instanceof Error ? e.message : 'Could not read that folder.' }));
    }
  }, []);
  const enterComputerDir = async (dir: LocalDir) => {
    setComputer((c) => ({ ...c, path: [...c.path, dir] }));
    setSel(new Set());
    await loadComputer(dir);
  };
  const chooseComputerFolder = async () => {
    try {
      const dir = await pickFolder();
      if (!dir) return;
      setComputer({ root: dir, path: [], listing: [], sizes: {}, loading: true, error: null });
      go({ kind: 'computer' });
      await loadComputer(dir);
    } catch (e) {
      notify({ title: 'Could not open folder', body: e instanceof Error ? e.message : 'Permission was denied.', level: 'error', appId: 'files' });
    }
  };
  const computerUp = async () => {
    const path = computer.path.slice(0, -1);
    setComputer((c) => ({ ...c, path }));
    setSel(new Set());
    const dir = path[path.length - 1] ?? computer.root;
    if (dir) await loadComputer(dir);
  };

  /* ── selection & keyboard ──────────────────────────────────────── */
  const select = (i: Item, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (e.shiftKey && anchor.current) setSel(new Set(rangeIds(items, anchor.current, i.id)));
    else if (e.ctrlKey || e.metaKey) {
      setSel((s) => {
        const n = new Set(s);
        if (n.has(i.id)) n.delete(i.id);
        else n.add(i.id);
        return n;
      });
      anchor.current = i.id;
    } else {
      setSel(new Set([i.id]));
      anchor.current = i.id;
    }
    setFocusIndex(items.findIndex((x) => x.id === i.id));
  };

  const cols = Math.max(1, Math.floor((paneWidth - 16) / 112));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSel(new Set(items.map((i) => i.id)));
    } else if (mod && e.key.toLowerCase() === 'c' && writable) {
      e.preventDefault();
      if (sel.size) clip.set('copy', [...sel]);
    } else if (mod && e.key.toLowerCase() === 'x' && writable) {
      e.preventDefault();
      if (sel.size) clip.set('cut', [...sel]);
    } else if (mod && e.key.toLowerCase() === 'v' && writable) {
      e.preventDefault();
      void paste();
    } else if (e.key === 'Delete' && selectedItems.length) {
      e.preventDefault();
      if (loc.kind === 'trash') void deleteForever(selectedItems);
      else if (loc.kind === 'solace') void trash(selectedItems);
    } else if (e.key === 'F2' && selectedItems.length === 1 && loc.kind === 'solace') {
      e.preventDefault();
      void rename(selectedItems[0]);
    } else if (e.key === 'Enter' && selectedItems.length === 1) {
      e.preventDefault();
      void open(selectedItems[0]);
    } else if (e.key === 'Backspace' && loc.kind === 'solace' && currentFolderId && currentFolderId !== ROOT_ID && !searching) {
      e.preventDefault();
      go({ kind: 'solace', folderId: entries[currentFolderId]?.parentId ?? ROOT_ID });
    } else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && items.length) {
      e.preventDefault();
      const step = view === 'grid' ? { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1, ArrowRight: 0, ArrowLeft: 0 };
      const cur = focusIndex >= 0 ? focusIndex : items.findIndex((i) => sel.has(i.id));
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, (cur < 0 ? -step[e.key as keyof typeof step] || 0 : cur) + (step[e.key as keyof typeof step] ?? 0)));
      const item = items[cur < 0 && step[e.key as keyof typeof step] > 0 ? 0 : next];
      select(item, e);
    }
  };

  /* ── context menus ─────────────────────────────────────────────── */
  const itemMenu = (e: React.MouseEvent, i: Item) => {
    e.preventDefault();
    e.stopPropagation();
    let targets = selectedItems;
    if (!sel.has(i.id)) {
      setSel(new Set([i.id]));
      anchor.current = i.id;
      targets = [i];
    }
    const one = targets.length === 1 ? targets[0] : null;
    const menu: MenuItem[] = [];
    if (loc.kind === 'trash') {
      menu.push({ label: 'Restore', icon: Undo2, onSelect: () => void run('Restoring…', () => fs.restore(targets.map((t) => t.id))) });
      menu.push({ label: 'Delete permanently…', icon: Trash2, danger: true, onSelect: () => void deleteForever(targets) });
    } else {
      if (one) menu.push({ label: 'Open', icon: FolderOpen, onSelect: () => void open(one) });
      if (loc.kind === 'computer') {
        menu.push({ label: 'Import to Solace Files', icon: Download, disabled: !targets.some((t) => t.kind === 'file'), onSelect: () => void importFromComputer(targets) });
      } else {
        menu.push({ label: 'Download', icon: Download, disabled: !targets.some((t) => t.kind === 'file'), onSelect: () => void download(targets) });
        menu.push({ separator: true });
        menu.push({ label: 'Copy', icon: Copy, hint: 'Ctrl+C', onSelect: () => clip.set('copy', targets.map((t) => t.id)) });
        menu.push({ label: 'Cut', icon: Scissors, hint: 'Ctrl+X', onSelect: () => clip.set('cut', targets.map((t) => t.id)) });
        if (one && one.kind === 'folder' && !searching) menu.push({ label: 'Paste into folder', icon: Clipboard, disabled: !clip.mode, onSelect: () => { void (async () => { await run('Pasting…', async () => { if (clip.mode === 'cut') { await fs.move(clip.ids, one.id); clip.clear(); } else await fs.copy(clip.ids, one.id); }); })(); } });
        menu.push({ separator: true });
        menu.push({ label: 'Rename', icon: Pencil, hint: 'F2', disabled: !one, onSelect: () => one && void rename(one) });
        menu.push({ label: 'Move to Trash', icon: Trash2, hint: 'Del', danger: true, onSelect: () => void trash(targets) });
      }
      menu.push({ separator: true });
      menu.push({ label: 'Details', icon: Info, onSelect: () => setDetails(true) });
    }
    useUi.getState().openMenu(e.clientX, e.clientY, menu);
  };

  const backgroundMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const menu: MenuItem[] = [];
    if (loc.kind === 'trash') menu.push({ label: 'Empty Trash…', icon: Trash2, danger: true, disabled: trashCount === 0, onSelect: () => void emptyTrash() });
    else if (loc.kind === 'solace') {
      menu.push({ label: 'New folder', icon: FolderPlus, onSelect: () => void newFolder() }, { label: 'New text file', icon: FilePlus2, onSelect: () => void newTextFile() }, { separator: true });
      menu.push({ label: 'Upload files…', icon: Upload, onSelect: () => fileInput.current?.click() }, { label: 'Paste', icon: Clipboard, hint: 'Ctrl+V', disabled: !clip.mode, onSelect: () => void paste() }, { separator: true });
    }
    menu.push({ label: 'Select all', hint: 'Ctrl+A', onSelect: () => setSel(new Set(items.map((i) => i.id))) });
    useUi.getState().openMenu(e.clientX, e.clientY, menu);
  };

  /* ── drag & drop ───────────────────────────────────────────────── */
  const onDragStart = (e: React.DragEvent, i: Item) => {
    if (loc.kind !== 'solace') return e.preventDefault();
    const ids = sel.has(i.id) ? [...sel] : [i.id];
    e.dataTransfer.setData('application/x-solace-ids', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'copyMove';
  };
  const dropOnFolder = async (e: React.DragEvent, folderId: string) => {
    const raw = e.dataTransfer.getData('application/x-solace-ids');
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const ids = (JSON.parse(raw) as string[]).filter((id) => typeof id === 'string' && entries[id]);
      await run('Moving…', () => (e.altKey ? fs.copy(ids, folderId) : fs.move(ids, folderId)));
    } catch {
      /* ignore malformed drag payload */
    }
  };
  const paneDragOver = (e: React.DragEvent) => {
    if (writable && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDropping(true);
    }
  };
  const paneDrop = (e: React.DragEvent) => {
    setDropping(false);
    if (writable && e.dataTransfer.files.length) {
      e.preventDefault();
      void upload([...e.dataTransfer.files]);
    }
  };

  /* ── rendering pieces ──────────────────────────────────────────── */
  const home = entries[ROOT_ID];
  const quick = ['Documents', 'Pictures', 'Downloads']
    .map((n) => Object.values(entries).find((e) => e.parentId === ROOT_ID && e.name === n && e.trashedAt === null))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const SideItem = ({ icon: Icon, label, active, onClick, onDrop, badge }: { icon: typeof Home; label: string; active: boolean; onClick: () => void; onDrop?: (e: React.DragEvent) => void; badge?: number }) => (
    <button
      className={cn('flex w-full items-center gap-2 rounded-[var(--s-radius-sm)] border-0 px-2.5 py-1.5 text-left text-[13px]', active ? 'bg-accentsoft text-ink' : 'bg-transparent text-dim hover:bg-surface3 hover:text-ink')}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
    >
      <Icon size={15} aria-hidden /> <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!badge && <span className="text-[11px] text-faint">{badge}</span>}
    </button>
  );

  const crumbs: Array<{ label: string; onClick?: () => void }> = [];
  if (loc.kind === 'solace' && !searching) for (const p of pathOf(entries, loc.folderId)) crumbs.push({ label: p.id === ROOT_ID ? 'Solace Files' : p.name, onClick: () => go({ kind: 'solace', folderId: p.id }) });
  else if (loc.kind === 'trash') crumbs.push({ label: 'Trash' });
  else if (loc.kind === 'computer' && computer.root) {
    crumbs.push({ label: computer.root.name, onClick: () => { setComputer((c) => ({ ...c, path: [] })); void loadComputer(computer.root!); } });
    computer.path.forEach((d, idx) => crumbs.push({ label: d.name, onClick: () => { const path = computer.path.slice(0, idx + 1); setComputer((c) => ({ ...c, path })); void loadComputer(d); } }));
  }
  if (searching) crumbs.push({ label: `Search results for “${search.trim()}”` });

  const canGoUp = (loc.kind === 'solace' && loc.folderId !== ROOT_ID && !searching) || (loc.kind === 'computer' && computer.path.length > 0);

  const renderRow = (i: Item) => {
    const Icon = iconFor(i);
    const selected = sel.has(i.id);
    const cut = clip.mode === 'cut' && clip.ids.includes(i.id);
    return (
      <div
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        data-item={i.name}
        draggable={loc.kind === 'solace'}
        onDragStart={(e) => onDragStart(e, i)}
        onDragOver={i.kind === 'folder' && loc.kind === 'solace' ? (e) => e.preventDefault() : undefined}
        onDrop={i.kind === 'folder' && loc.kind === 'solace' ? (e) => void dropOnFolder(e, i.id) : undefined}
        onClick={(e) => select(i, e)}
        onDoubleClick={() => void open(i)}
        onContextMenu={(e) => itemMenu(e, i)}
        className={cn('grid h-full cursor-default grid-cols-[minmax(0,1fr)] items-center gap-2 px-3 @[560px]:grid-cols-[minmax(0,1fr)_150px_80px]', selected ? 'bg-accentsoft' : 'hover:bg-surface3', cut && 'opacity-50')}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon size={17} strokeWidth={1.6} className={i.kind === 'folder' ? 'shrink-0 text-accent' : 'shrink-0 text-dim'} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-ink">{i.name}</span>
            {i.where && <span className="block truncate text-[11px] text-faint">{i.where}</span>}
          </span>
        </span>
        <span className="hidden truncate text-[12px] text-dim @[560px]:block">{i.modified ? formatDateTime(i.modified) : '—'}</span>
        <span className="hidden text-right text-[12px] text-dim @[560px]:block">{i.size === null ? (i.kind === 'folder' ? '—' : '…') : formatBytes(i.size)}</span>
      </div>
    );
  };

  const renderTile = (i: Item) => {
    const Icon = iconFor(i);
    const selected = sel.has(i.id);
    return (
      <div
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        data-item={i.name}
        draggable={loc.kind === 'solace'}
        onDragStart={(e) => onDragStart(e, i)}
        onDragOver={i.kind === 'folder' && loc.kind === 'solace' ? (e) => e.preventDefault() : undefined}
        onDrop={i.kind === 'folder' && loc.kind === 'solace' ? (e) => void dropOnFolder(e, i.id) : undefined}
        onClick={(e) => select(i, e)}
        onDoubleClick={() => void open(i)}
        onContextMenu={(e) => itemMenu(e, i)}
        className={cn('flex h-[96px] w-[104px] cursor-default flex-col items-center gap-1.5 rounded-[var(--s-radius-sm)] p-2 text-center', selected ? 'bg-accentsoft' : 'hover:bg-surface3', clip.mode === 'cut' && clip.ids.includes(i.id) && 'opacity-50')}
      >
        <Icon size={36} strokeWidth={1.3} className={i.kind === 'folder' ? 'text-accent' : 'text-dim'} aria-hidden />
        <span className="line-clamp-2 w-full text-[12px] leading-tight break-words text-ink">{i.name}</span>
      </div>
    );
  };

  const gridRows = useMemo(() => {
    const out: Item[][] = [];
    for (let n = 0; n < items.length; n += cols) out.push(items.slice(n, n + cols));
    return out;
  }, [items, cols]);

  const selectedOne = selectedItems.length === 1 ? selectedItems[0] : null;
  const folderEntry = currentFolderId ? entries[currentFolderId] : null;

  if (!loaded) return <div className="grid h-full place-items-center text-faint">Loading files…</div>;

  return (
    <div className="flex h-full" onKeyDown={onKeyDown}>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} aria-label="Choose files to upload" />

      {/* Sidebar */}
      <nav className="hidden w-[190px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-chrome p-2 @[620px]:flex" aria-label="Locations">
        <div className="s-label px-2.5 pt-1 pb-1">Solace Files</div>
        <SideItem icon={Home} label="Home" active={loc.kind === 'solace' && loc.folderId === ROOT_ID && !searching} onClick={() => go({ kind: 'solace', folderId: ROOT_ID })} onDrop={home ? (e) => void dropOnFolder(e, ROOT_ID) : undefined} />
        {quick.map((q) => (
          <SideItem key={q.id} icon={FolderOpen} label={q.name} active={loc.kind === 'solace' && loc.folderId === q.id && !searching} onClick={() => go({ kind: 'solace', folderId: q.id })} onDrop={(e) => void dropOnFolder(e, q.id)} />
        ))}
        <SideItem icon={Trash2} label="Trash" active={loc.kind === 'trash'} onClick={() => go({ kind: 'trash' })} badge={trashCount} />
        <div className="s-label px-2.5 pt-4 pb-1">This computer</div>
        {computer.root && <SideItem icon={HardDrive} label={computer.root.name} active={loc.kind === 'computer'} onClick={() => go({ kind: 'computer' })} />}
        {folderAccessSupported() ? (
          <button className="s-btn !h-8 mt-1 justify-start text-[12.5px]" onClick={() => void chooseComputerFolder()}>
            <Monitor size={14} /> {computer.root ? 'Choose another folder…' : 'Open a folder…'}
          </button>
        ) : (
          <p className="m-0 px-2.5 text-[11.5px] leading-snug text-faint">This browser can’t browse folders on your computer. You can still upload files into Solace Files.</p>
        )}
        <p className="m-0 mt-auto px-2.5 pt-3 text-[11.5px] leading-snug text-faint">
          Solace Files are stored in this browser ({formatBytes(usedBytes(entries))}). They aren’t on your computer’s disk and don’t sync anywhere.
        </p>
      </nav>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b border-line p-1.5">
          <button className="s-icon-btn" aria-label="Back" disabled={hi === 0} onClick={() => jump(hi - 1)}><ArrowLeft size={16} /></button>
          <button className="s-icon-btn" aria-label="Forward" disabled={hi >= hist.length - 1} onClick={() => jump(hi + 1)}><ArrowRight size={16} /></button>
          <button className="s-icon-btn" aria-label="Up one folder" disabled={!canGoUp} onClick={() => (loc.kind === 'computer' ? void computerUp() : go({ kind: 'solace', folderId: entries[(loc as { folderId: string }).folderId]?.parentId ?? ROOT_ID }))}><ArrowUp size={16} /></button>
          <nav aria-label="Breadcrumb" className="mx-1 flex min-w-0 flex-1 items-center overflow-hidden rounded-[var(--s-radius-sm)] border border-line bg-surface2 px-2 text-[12.5px]">
            <ol className="m-0 flex min-w-0 list-none items-center p-0">
              {crumbs.map((c, idx) => (
                <li key={idx} className="flex min-w-0 items-center">
                  {idx > 0 && <ChevronRight size={12} className="mx-0.5 shrink-0 text-faint" aria-hidden />}
                  {c.onClick && idx < crumbs.length - 1 ? (
                    <button className="truncate rounded border-0 bg-transparent px-1 py-1 text-dim hover:bg-surface3 hover:text-ink" onClick={c.onClick}>{c.label}</button>
                  ) : (
                    <span className="truncate px-1 py-1 text-ink" aria-current="page">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-faint" aria-hidden />
            <input className="s-input w-36 !pl-7" placeholder="Search" aria-label="Search files" value={search} onChange={(e) => { setSearch(e.target.value); setSel(new Set()); }} />
            {search && <button className="s-icon-btn absolute top-0.5 right-0.5 !h-6 !w-6" aria-label="Clear search" onClick={() => setSearch('')}><X size={12} /></button>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-line px-1.5 py-1">
          {writable && (
            <>
              <button className="s-btn !h-7" onClick={() => void newFolder()}><FolderPlus size={14} /> New folder</button>
              <button className="s-btn !h-7" onClick={() => fileInput.current?.click()}><Upload size={14} /> Upload</button>
              <button className="s-btn !h-7" disabled={!clip.mode} onClick={() => void paste()} aria-label="Paste"><Clipboard size={14} /></button>
            </>
          )}
          {loc.kind === 'trash' && (
            <>
              <button className="s-btn !h-7" disabled={!selectedItems.length} onClick={() => void run('Restoring…', () => fs.restore(selectedItems.map((i) => i.id)))}><Undo2 size={14} /> Restore</button>
              <button className="s-btn s-btn-danger !h-7" disabled={trashCount === 0} onClick={() => void emptyTrash()}><Trash2 size={14} /> Empty Trash</button>
            </>
          )}
          {loc.kind === 'computer' && <button className="s-btn !h-7" disabled={!selectedItems.some((i) => i.kind === 'file')} onClick={() => void importFromComputer(selectedItems)}><Download size={14} /> Import to Solace Files</button>}
          {selectedItems.length > 0 && loc.kind === 'solace' && (
            <>
              <span className="mx-1 h-4 w-px bg-line" aria-hidden />
              <button className="s-icon-btn" aria-label="Rename" title="Rename (F2)" disabled={selectedItems.length !== 1} onClick={() => selectedOne && void rename(selectedOne)}><Pencil size={15} /></button>
              <button className="s-icon-btn" aria-label="Download" title="Download" onClick={() => void download(selectedItems)}><Download size={15} /></button>
              <button className="s-icon-btn hover:!text-danger" aria-label="Move to Trash" title="Move to Trash (Del)" onClick={() => void trash(selectedItems)}><Trash2 size={15} /></button>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <select className="s-input !h-7" aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
              <option value="all">All types</option>
              <option value="folder">Folders</option>
              <option value="document">Documents</option>
              <option value="image">Images</option>
              <option value="other">Other</option>
            </select>
            <select className="s-input !h-7" aria-label="Sort by" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="name">Name</option>
              <option value="modified">Modified</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
            <button className="s-icon-btn" aria-label={sortDir === 'asc' ? 'Sort ascending (click for descending)' : 'Sort descending (click for ascending)'} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>{sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button>
            <button className={cn('s-icon-btn', view === 'list' && '!bg-accentsoft !text-accent')} aria-label="List view" aria-pressed={view === 'list'} onClick={() => { setView('list'); try { localStorage.setItem(VIEW_KEY, 'list'); } catch { /* ignore */ } }}><List size={15} /></button>
            <button className={cn('s-icon-btn', view === 'grid' && '!bg-accentsoft !text-accent')} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => { setView('grid'); try { localStorage.setItem(VIEW_KEY, 'grid'); } catch { /* ignore */ } }}><Grid2x2 size={15} /></button>
            <button className={cn('s-icon-btn', details && '!bg-accentsoft !text-accent')} aria-label="Details pane" aria-pressed={details} onClick={() => setDetails((d) => !d)}><Info size={15} /></button>
          </div>
        </div>

        {loc.kind === 'computer' && (
          <div className="border-b border-line bg-surface2 px-3 py-1.5 text-[12px] text-dim">
            <Monitor size={12} className="mr-1 inline" aria-hidden /> You’re browsing a folder on your computer you chose to share with Solace. Access is read-only and ends when you close this tab.
          </div>
        )}
        {busy && <div role="status" className="border-b border-line bg-surface2 px-3 py-1 text-[12px] text-dim">{busy}</div>}

        <div
          ref={paneRef}
          className={cn('relative min-h-0 flex-1 outline-none', dropping && 'ring-2 ring-inset ring-[var(--s-accent)]')}
          onContextMenu={backgroundMenu}
          onClick={(e) => e.target === e.currentTarget && setSel(new Set())}
          onDragOver={paneDragOver}
          onDragLeave={() => setDropping(false)}
          onDrop={paneDrop}
          tabIndex={0}
          aria-label="Files"
        >
          {loc.kind === 'computer' && computer.loading && items.length === 0 ? (
            <div className="grid h-full place-items-center text-faint" role="status">Reading folder…</div>
          ) : loc.kind === 'computer' && computer.error ? (
            <EmptyState icon={Monitor} title="Can’t read this folder" hint={computer.error} />
          ) : loc.kind === 'computer' && !computer.root ? (
            <EmptyState icon={Monitor} title="No folder shared" hint="Choose a folder on your computer to browse it here." action={<button className="s-btn s-btn-primary" onClick={() => void chooseComputerFolder()}>Open a folder…</button>} />
          ) : items.length === 0 ? (
            loc.kind === 'trash' ? (
              <EmptyState icon={Trash2} title="Trash is empty" hint="Items you delete are kept here until you empty the Trash." />
            ) : searching ? (
              <EmptyState icon={Search} title="No results" hint={`Nothing matches “${search.trim()}”.`} />
            ) : typeFilter !== 'all' ? (
              <EmptyState icon={FolderOpen} title="No items of this type" hint="Try a different type filter." />
            ) : (
              <EmptyState icon={FolderOpen} title="This folder is empty" hint={writable ? 'Create a folder, or drop files here to upload them.' : undefined} action={writable ? <button className="s-btn s-btn-primary" onClick={() => fileInput.current?.click()}>Upload files</button> : undefined} />
            )
          ) : view === 'list' ? (
            <div className="@container flex h-full flex-col">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-line px-3 py-1 text-[11.5px] text-faint @[560px]:grid-cols-[minmax(0,1fr)_150px_80px]" aria-hidden>
                <span>Name</span>
                <span className="hidden @[560px]:block">Modified</span>
                <span className="hidden text-right @[560px]:block">Size</span>
              </div>
              <VirtualList className="min-h-0 flex-1" role="listbox" label="Files and folders" items={items} rowHeight={36} getKey={(i) => i.id} renderRow={renderRow} scrollToIndex={focusIndex} />
            </div>
          ) : (
            <VirtualList className="h-full" role="listbox" label="Files and folders" items={gridRows} rowHeight={100} getKey={(r) => r.map((i) => i.id).join('|')} renderRow={(row) => <div className="flex gap-1 px-2 pt-1">{row.map((i) => <div key={i.id}>{renderTile(i)}</div>)}</div>} scrollToIndex={focusIndex >= 0 ? Math.floor(focusIndex / cols) : undefined} />
          )}
          {dropping && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-accentsoft text-[14px] text-ink">Drop files to upload to Solace Files</div>}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-1 text-[11.5px] text-faint" aria-live="polite">
          <span>{items.length} item{items.length === 1 ? '' : 's'}{sel.size ? ` · ${sel.size} selected` : ''}</span>
          <span>{loc.kind === 'computer' ? 'On your computer (read-only)' : 'Solace Files · this browser only'}</span>
        </div>
      </div>

      {details && (
        <aside className="hidden w-[220px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-chrome p-3 text-[12.5px] @[760px]:flex" aria-label="Details">
          {selectedOne ? (
            <>
              <div className="grid place-items-center py-3">{(() => { const Icon = iconFor(selectedOne); return <Icon size={44} strokeWidth={1.2} className={selectedOne.kind === 'folder' ? 'text-accent' : 'text-dim'} aria-hidden />; })()}</div>
              <div className="font-medium break-words text-ink">{selectedOne.name}</div>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-dim">
                <dt>Type</dt><dd className="m-0 text-ink">{typeLabel(selectedOne)}</dd>
                <dt>Size</dt><dd className="m-0 text-ink">{selectedOne.size === null ? '—' : formatBytes(selectedOne.size)}</dd>
                <dt>Modified</dt><dd className="m-0 text-ink">{selectedOne.modified ? formatDateTime(selectedOne.modified) : '—'}</dd>
                {loc.kind !== 'computer' && entries[selectedOne.id] && (<><dt>Created</dt><dd className="m-0 text-ink">{formatDateTime(entries[selectedOne.id].created)}</dd></>)}
                <dt>Stored</dt><dd className="m-0 text-ink">{loc.kind === 'computer' ? 'On your computer (read-only)' : 'In this browser (Solace Files)'}</dd>
              </dl>
            </>
          ) : selectedItems.length > 1 ? (
            <div className="text-dim">{selectedItems.length} items selected{(() => { const total = selectedItems.reduce((n, i) => n + (i.size ?? 0), 0); return total ? ` · ${formatBytes(total)}` : ''; })()}</div>
          ) : (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-dim">
              <dt>Location</dt><dd className="m-0 text-ink">{loc.kind === 'computer' ? (computer.root?.name ?? '—') : loc.kind === 'trash' ? 'Trash' : (folderEntry?.id === ROOT_ID ? 'Solace Files' : folderEntry?.name ?? '—')}</dd>
              <dt>Items</dt><dd className="m-0 text-ink">{items.length}</dd>
              <dt>Stored</dt><dd className="m-0 text-ink">{loc.kind === 'computer' ? 'On your computer (read-only)' : 'In this browser'}</dd>
            </dl>
          )}
        </aside>
      )}

      {preview && <ImagePreview item={preview} getBlob={() => getBlobFor(preview)} onClose={() => setPreview(null)} />}
    </div>
  );
}
