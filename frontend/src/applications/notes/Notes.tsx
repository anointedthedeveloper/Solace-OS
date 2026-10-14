import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, NotebookPen, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { useNotes, type Note } from '@/stores/notesStore';
import { confirmDialog } from '@/stores/uiStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { VirtualList } from '@/components/ui/VirtualList';
import { Segmented } from '@/components/ui/Segmented';
import { countWords, formatDateTime, formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';

type View = 'active' | 'archived';

export function filterNotes(notes: Note[], view: View, query: string): Note[] {
  const q = query.trim().toLowerCase();
  return notes
    .filter((n) => n.archived === (view === 'archived'))
    .filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

function NoteRow({ note, selected, onSelect }: { note: Note; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn('flex h-full w-full flex-col justify-center gap-0.5 border-0 border-b border-line bg-transparent px-3 text-left', selected ? 'bg-accentsoft' : 'hover:bg-surface3')}
    >
      <span className="flex items-center gap-1.5">
        {note.pinned && <Pin size={11} className="shrink-0 text-accent" aria-label="Pinned" />}
        <span className="truncate text-[13px] font-medium text-ink">{note.title || 'Untitled note'}</span>
      </span>
      <span className="truncate text-[12px] text-dim">{note.content.replace(/\s+/g, ' ').trim() || 'No additional text'}</span>
      <span className="text-[11px] text-faint">{formatRelative(note.updatedAt)}</span>
    </button>
  );
}

export default function Notes({ props }: AppComponentProps) {
  const notes = useNotes((s) => s.notes);
  const { create, update, togglePin, setArchived, remove } = useNotes.getState();
  const [view, setView] = useState<View>('active');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState(false); // narrow layouts: list ⇄ editor

  const list = useMemo(() => filterNotes(notes, view, query), [notes, view, query]);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    if (typeof props.noteId === 'string' && notes.some((n) => n.id === props.noteId)) {
      setSelectedId(props.noteId);
      setDetail(true);
    }
  }, [props.noteId, notes]);

  // Keep a sensible selection as the list changes.
  useEffect(() => {
    if (selectedId && !list.some((n) => n.id === selectedId) && !notes.some((n) => n.id === selectedId)) setSelectedId(null);
  }, [list, notes, selectedId]);

  const newNote = () => {
    setView('active');
    setQuery('');
    setSelectedId(create());
    setDetail(true);
  };

  const onDelete = async (n: Note) => {
    const ok = await confirmDialog({ title: 'Delete note?', message: `“${n.title || 'Untitled note'}” will be permanently deleted. This can't be undone.`, confirmLabel: 'Delete', danger: true });
    if (ok) {
      remove(n.id);
      setSelectedId(null);
      setDetail(false);
    }
  };

  return (
    <div className="flex h-full">
      <section className={cn('flex w-full shrink-0 flex-col border-r border-line @[560px]:flex @[560px]:w-[260px]', detail ? 'hidden' : 'flex')} aria-label="Notes list">
        <div className="flex items-center gap-2 border-b border-line p-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" aria-hidden />
            <input className="s-input w-full !pl-8" placeholder="Search notes" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="s-icon-btn border-line bg-surface2" aria-label="New note" title="New note" onClick={newNote}>
            <Plus size={16} />
          </button>
        </div>
        <div className="border-b border-line p-2">
          <Segmented<View> label="Show" value={view} onChange={setView} options={[{ value: 'active', label: 'Notes' }, { value: 'archived', label: 'Archived' }]} />
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={query ? Search : view === 'archived' ? Archive : StickyNote}
            title={query ? 'No matching notes' : view === 'archived' ? 'Nothing archived' : 'No notes yet'}
            hint={query ? 'Try a different search.' : view === 'archived' ? 'Archived notes are kept here, out of the way.' : 'Capture a thought. Notes save as you type.'}
            action={!query && view === 'active' ? <button className="s-btn s-btn-primary" onClick={newNote}>New note</button> : undefined}
          />
        ) : (
          <VirtualList className="min-h-0 flex-1" items={list} rowHeight={64} getKey={(n) => n.id} label="Notes" renderRow={(n) => <NoteRow note={n} selected={n.id === selectedId} onSelect={() => { setSelectedId(n.id); setDetail(true); }} />} />
        )}
      </section>

      <section className={cn('min-w-0 flex-1 flex-col', detail ? 'flex' : 'hidden @[560px]:flex')} aria-label="Note editor">
        {selected ? (
          <>
            <div className="flex items-center gap-1 border-b border-line p-2">
              <button className="s-icon-btn @[560px]:hidden" aria-label="Back to notes" onClick={() => setDetail(false)}>
                <ArrowLeft size={16} />
              </button>
              <input className="min-w-0 flex-1 border-0 bg-transparent px-2 text-[16px] font-semibold outline-none placeholder:text-faint focus-visible:outline-none" placeholder="Title" aria-label="Note title" value={selected.title} onChange={(e) => update(selected.id, { title: e.target.value })} />
              <button className="s-icon-btn" aria-label={selected.pinned ? 'Unpin note' : 'Pin note'} title={selected.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(selected.id)} disabled={selected.archived}>
                {selected.pinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
              <button className="s-icon-btn" aria-label={selected.archived ? 'Restore note' : 'Archive note'} title={selected.archived ? 'Restore' : 'Archive'} onClick={() => { setArchived(selected.id, !selected.archived); setSelectedId(null); setDetail(false); }}>
                {selected.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
              <button className="s-icon-btn hover:!text-danger" aria-label="Delete note" title="Delete" onClick={() => void onDelete(selected)}>
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 text-[14px] leading-relaxed outline-none focus-visible:outline-none"
              placeholder="Start writing…"
              aria-label="Note content"
              value={selected.content}
              onChange={(e) => update(selected.id, { content: e.target.value })}
            />
            <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11.5px] text-faint">
              <span>
                {countWords(selected.content)} words · {selected.content.length} characters
              </span>
              <span title={`Created ${formatDateTime(selected.createdAt)}`}>Saved · edited {formatDateTime(selected.updatedAt)}</span>
            </div>
          </>
        ) : (
          <EmptyState icon={NotebookPen} title="Select a note" hint="Choose a note from the list, or create a new one." action={<button className="s-btn" onClick={newNote}>New note</button>} />
        )}
      </section>
    </div>
  );
}
