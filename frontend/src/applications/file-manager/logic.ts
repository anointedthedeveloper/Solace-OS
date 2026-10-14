import { FileText, File as FileIcon, FileImage, Folder, FileArchive, FileCode, FileSpreadsheet, type LucideIcon } from 'lucide-react';
import { isTextLike, type FsEntry } from '@/services/fsStore';

export type ItemKind = 'folder' | 'image' | 'text' | 'pdf' | 'archive' | 'other';
export type SortKey = 'name' | 'modified' | 'size' | 'type';
export type TypeFilter = 'all' | 'folder' | 'document' | 'image' | 'other';

/** A row in the file manager, whether it comes from Solace Files or the user's computer. */
export interface Item {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  size: number | null;
  modified: number | null;
  mime: string;
  /** Breadcrumb-ish location, shown in search results. */
  where?: string;
}

export function itemKind(i: Pick<Item, 'kind' | 'mime' | 'name'>): ItemKind {
  if (i.kind === 'folder') return 'folder';
  if (i.mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(i.name)) return 'image';
  if (i.mime === 'application/pdf' || /\.pdf$/i.test(i.name)) return 'pdf';
  if (/\.(zip|gz|tar|7z|rar)$/i.test(i.name)) return 'archive';
  if (isTextLike(i)) return 'text';
  return 'other';
}

export function iconFor(i: Pick<Item, 'kind' | 'mime' | 'name'>): LucideIcon {
  switch (itemKind(i)) {
    case 'folder': return Folder;
    case 'image': return FileImage;
    case 'text': return /\.(js|ts|tsx|jsx|json|html|css|xml|ya?ml)$/i.test(i.name) ? FileCode : /\.csv$/i.test(i.name) ? FileSpreadsheet : FileText;
    case 'archive': return FileArchive;
    default: return FileIcon;
  }
}

export function typeLabel(i: Pick<Item, 'kind' | 'mime' | 'name'>): string {
  switch (itemKind(i)) {
    case 'folder': return 'Folder';
    case 'image': return 'Image';
    case 'text': return 'Text document';
    case 'pdf': return 'PDF document';
    case 'archive': return 'Archive';
    default: {
      const ext = i.name.includes('.') ? i.name.split('.').pop()!.toUpperCase() : '';
      return ext ? `${ext} file` : 'File';
    }
  }
}

export function toItem(e: FsEntry, where?: string): Item {
  return { id: e.id, name: e.name, kind: e.kind, size: e.kind === 'file' ? e.size : null, modified: e.modified, mime: e.mime, where };
}

export function matchesType(i: Item, f: TypeFilter): boolean {
  if (f === 'all') return true;
  const k = itemKind(i);
  if (f === 'folder') return k === 'folder';
  if (f === 'image') return k === 'image';
  if (f === 'document') return k === 'text' || k === 'pdf';
  return k === 'other' || k === 'archive';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortItems(items: Item[], key: SortKey, dir: 'asc' | 'desc'): Item[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1; // folders always first
    let r = 0;
    if (key === 'name') r = collator.compare(a.name, b.name);
    else if (key === 'modified') r = (a.modified ?? 0) - (b.modified ?? 0);
    else if (key === 'size') r = (a.size ?? 0) - (b.size ?? 0);
    else r = collator.compare(typeLabel(a), typeLabel(b)) || collator.compare(a.name, b.name);
    return r * m || collator.compare(a.name, b.name);
  });
}

/** Range selection by index (shift-click). */
export function rangeIds(items: Item[], fromId: string, toId: string): string[] {
  const a = items.findIndex((i) => i.id === fromId);
  const b = items.findIndex((i) => i.id === toId);
  if (a < 0 || b < 0) return [toId];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return items.slice(lo, hi + 1).map((i) => i.id);
}

export type Location =
  | { kind: 'solace'; folderId: string }
  | { kind: 'trash' }
  | { kind: 'search'; query: string; from: string }
  | { kind: 'computer' };
