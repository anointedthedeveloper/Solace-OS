import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Cloud, Download, FolderPlus, Pencil, RefreshCw, Trash2, Undo2, Upload } from 'lucide-react';
import { cloud, type CloudItem, type CloudUsage } from '@/services/cloudFiles';
import { ApiError } from '@/services/api';
import { downloadBlob, readTextSafely } from '@/services/localFolder';
import { validateName } from '@/services/fsStore';
import { confirmDialog, promptDialog } from '@/stores/uiStore';
import { notify } from '@/stores/notificationStore';
import { useDocs } from '@/stores/docsStore';
import { useWindows } from '@/stores/windowStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { VirtualList } from '@/components/ui/VirtualList';
import { formatBytes, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { iconFor } from './logic';

type View = 'files' | 'trash';
interface Crumb {
  id: string | null;
  name: string;
}

const asItem = (c: CloudItem) => ({ kind: c.kind, mime: c.mimeType, name: c.name });

function message(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.unreachable) return 'The Solace server can’t be reached.';
    return e.message;
  }
  return 'Something went wrong.';
}

function ImagePreview({ item, onClose }: { item: CloudItem; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    cloud.download(item.id).then((b) => {
      if (!alive) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    }).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [item.id]);
  return (
    <Modal title={item.name} onClose={onClose} width={720} footer={<button className="s-btn" onClick={onClose}>Close</button>}>
      <div className="grid min-h-48 place-items-center">{failed ? <p>This image could not be loaded.</p> : url ? <img src={url} alt={item.name} className="max-h-[60vh] max-w-full object-contain" /> : <p>Loading…</p>}</div>
    </Modal>
  );
}

/** The "Cloud" location of the Files app: files stored on the Solace server for the signed-in account. */
export function CloudFiles() {
  const [view, setView] = useState<View>('files');
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: 'Cloud' }]);
  const [items, setItems] = useState<CloudItem[]>([]);
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<CloudItem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderId = path[path.length - 1].id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, u] = await Promise.all([view === 'trash' ? cloud.trash() : cloud.list(folderId), cloud.usage()]);
      setItems(list);
      setUsage(u);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [view, folderId]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  const sorted = useMemo(() => (view === 'trash' ? items : items), [items, view]);
  const current = items.find((i) => i.id === selected) ?? null;

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e) {
      notify({ title: 'Cloud files', body: message(e), level: 'error', appId: 'files' });
    } finally {
      setBusy(null);
    }
  };

  const open = async (i: CloudItem) => {
    if (i.kind === 'folder') {
      if (view === 'files') setPath((p) => [...p, { id: i.id, name: i.name }]);
      return;
    }
    if (view === 'trash') return;
    if (i.mimeType.startsWith('image/')) return setPreview(i);
    await act('Opening…', async () => {
      const blob = await cloud.download(i.id);
      if (i.mimeType.startsWith('text/') || i.mimeType === 'application/json') {
        useDocs.getState().create({ name: i.name, content: await readTextSafely(blob) });
        useWindows.getState().openApp('editor');
      } else downloadBlob(blob, i.name);
    });
  };

  const upload = (files: File[]) =>
    act('Uploading…', async () => {
      for (const f of files) {
        try {
          await cloud.upload(folderId, f);
        } catch (e) {
          notify({ title: `Could not upload ${f.name}`, body: message(e), level: 'warning', appId: 'files' });
        }
      }
    });

  const newFolder = async () => {
    const name = await promptDialog({ title: 'New cloud folder', label: 'Folder name', initial: 'New folder', confirmLabel: 'Create', validate: validateName });
    if (name) await act('Creating…', async () => void (await cloud.createFolder(folderId, name.trim())));
  };
  const rename = async (i: CloudItem) => {
    const name = await promptDialog({ title: 'Rename', label: 'New name', initial: i.name, confirmLabel: 'Rename', validate: validateName });
    if (name && name.trim() !== i.name) await act('Renaming…', async () => void (await cloud.rename(i.id, name.trim())));
  };
  const forever = async (i: CloudItem) => {
    if (await confirmDialog({ title: 'Delete permanently?', message: `“${i.name}” will be permanently deleted from the server. This can't be undone.`, confirmLabel: 'Delete permanently', danger: true })) await act('Deleting…', () => cloud.deleteForever(i.id));
  };
  const emptyTrash = async () => {
    if (await confirmDialog({ title: 'Empty the cloud Trash?', message: 'Everything in the cloud Trash will be permanently deleted from the server. This can’t be undone.', confirmLabel: 'Empty Trash', danger: true })) await act('Emptying…', async () => void (await cloud.emptyTrash()));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col" onDragOver={(e) => e.dataTransfer.types.includes('Files') && view === 'files' && e.preventDefault()} onDrop={(e) => { if (view === 'files' && e.dataTransfer.files.length) { e.preventDefault(); void upload([...e.dataTransfer.files]); } }}>
      <input ref={input} type="file" multiple hidden aria-label="Choose files to upload to the cloud" onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <div className="flex flex-wrap items-center gap-1 border-b border-line p-1.5">
        <button className="s-icon-btn" aria-label="Up one folder" disabled={view !== 'files' || path.length === 1} onClick={() => setPath((p) => p.slice(0, -1))}><ArrowLeft size={16} /></button>
        <nav aria-label="Cloud breadcrumb" className="mx-1 flex min-w-0 flex-1 items-center overflow-hidden rounded-[var(--s-radius-sm)] border border-line bg-surface2 px-2 text-[12.5px]">
          <ol className="m-0 flex min-w-0 list-none items-center p-0">
            {(view === 'trash' ? [{ id: null, name: 'Cloud Trash' }] : path).map((c, i, arr) => (
              <li key={`${c.id}-${i}`} className="flex min-w-0 items-center">
                {i > 0 && <ChevronRight size={12} className="mx-0.5 shrink-0 text-faint" aria-hidden />}
                {i < arr.length - 1 ? <button className="truncate rounded border-0 bg-transparent px-1 py-1 text-dim hover:bg-surface3 hover:text-ink" onClick={() => setPath((p) => p.slice(0, i + 1))}>{c.name}</button> : <span className="truncate px-1 py-1 text-ink" aria-current="page">{c.name}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <button className="s-icon-btn" aria-label="Refresh" title="Refresh" onClick={() => void load()}><RefreshCw size={15} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-1.5 py-1">
        {view === 'files' ? (
          <>
            <button className="s-btn !h-7" onClick={() => void newFolder()}><FolderPlus size={14} /> New folder</button>
            <button className="s-btn !h-7" onClick={() => input.current?.click()}><Upload size={14} /> Upload</button>
            <button className="s-btn !h-7" onClick={() => { setView('trash'); }}><Trash2 size={14} /> Trash</button>
          </>
        ) : (
          <>
            <button className="s-btn !h-7" onClick={() => setView('files')}><ArrowLeft size={14} /> Back to files</button>
            <button className="s-btn !h-7" disabled={!current} onClick={() => current && void act('Restoring…', async () => void (await cloud.restore(current.id)))}><Undo2 size={14} /> Restore</button>
            <button className="s-btn s-btn-danger !h-7" disabled={items.length === 0} onClick={() => void emptyTrash()}>Empty Trash</button>
          </>
        )}
        {current && view === 'files' && (
          <>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <button className="s-icon-btn" aria-label="Rename" title="Rename" onClick={() => void rename(current)}><Pencil size={15} /></button>
            <button className="s-icon-btn" aria-label="Download" title="Download" disabled={current.kind === 'folder'} onClick={() => void act('Preparing download…', async () => downloadBlob(await cloud.download(current.id), current.name))}><Download size={15} /></button>
            <button className="s-icon-btn hover:!text-danger" aria-label="Move to Trash" title="Move to Trash" onClick={() => void act('Moving to Trash…', () => cloud.toTrash(current.id))}><Trash2 size={15} /></button>
          </>
        )}
        {current && view === 'trash' && <button className="s-btn s-btn-danger !h-7" onClick={() => void forever(current)}>Delete permanently…</button>}
      </div>
      <div className="border-b border-line bg-surface2 px-3 py-1.5 text-[12px] text-dim">
        <Cloud size={12} className="mr-1 inline" aria-hidden /> Cloud files are stored on your Solace server and only your account can access them. Allowed types: text, images, PDF and Office/zip files.
      </div>
      {busy && <div role="status" className="border-b border-line bg-surface2 px-3 py-1 text-[12px] text-dim">{busy}</div>}

      <div className="relative min-h-0 flex-1" aria-label="Cloud files">
        {loading && items.length === 0 ? (
          <div className="grid h-full place-items-center text-faint" role="status">Loading…</div>
        ) : error ? (
          <EmptyState icon={Cloud} title="Can’t load cloud files" hint={error} action={<button className="s-btn" onClick={() => void load()}>Try again</button>} />
        ) : sorted.length === 0 ? (
          view === 'trash' ? <EmptyState icon={Trash2} title="Trash is empty" /> : <EmptyState icon={Cloud} title="This folder is empty" hint="Upload files or drop them here." action={<button className="s-btn s-btn-primary" onClick={() => input.current?.click()}>Upload files</button>} />
        ) : (
          <VirtualList className="h-full" role="listbox" label="Cloud files and folders" items={sorted} rowHeight={36} getKey={(i) => i.id} renderRow={(i) => {
            const Icon = iconFor(asItem(i));
            return (
              <div role="option" aria-selected={selected === i.id} tabIndex={0} data-item={i.name} onClick={() => setSelected(i.id)} onDoubleClick={() => void open(i)} onKeyDown={(e) => { if (e.key === 'Enter') void open(i); }} className={cn('grid h-full cursor-default grid-cols-[minmax(0,1fr)_150px_80px] items-center gap-2 px-3', selected === i.id ? 'bg-accentsoft' : 'hover:bg-surface3')}>
                <span className="flex min-w-0 items-center gap-2.5"><Icon size={17} strokeWidth={1.6} className={i.kind === 'folder' ? 'shrink-0 text-accent' : 'shrink-0 text-dim'} aria-hidden /><span className="truncate text-[13px] text-ink">{i.name}</span></span>
                <span className="truncate text-[12px] text-dim">{formatDateTime(Date.parse(i.updatedAt))}</span>
                <span className="text-right text-[12px] text-dim">{i.kind === 'folder' ? '—' : formatBytes(i.size)}</span>
              </div>
            );
          }} />
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-1 text-[11.5px] text-faint" aria-live="polite">
        <span>{sorted.length} item{sorted.length === 1 ? '' : 's'}</span>
        <span>{usage ? `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)} used · ${formatBytes(usage.maxFileBytes)} per file max` : ''}</span>
      </div>
      {preview && <ImagePreview item={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
