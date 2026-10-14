/**
 * Access to real folders on the user's computer via the File System Access API.
 * Only available in Chromium-based browsers, only after the user explicitly picks a
 * folder in the browser's own permission dialog. Nothing here runs without that grant.
 */
export interface LocalHandle {
  kind: 'file' | 'directory';
  name: string;
}
export interface LocalFile extends LocalHandle {
  kind: 'file';
  getFile(): Promise<File>;
}
export interface LocalDir extends LocalHandle {
  kind: 'directory';
  entries(): AsyncIterableIterator<[string, LocalFile | LocalDir]>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<LocalFile & { createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }> }>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<LocalDir>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite' }) => Promise<LocalDir>;
  showOpenFilePicker?: (o?: unknown) => Promise<Array<LocalFile>>;
  showSaveFilePicker?: (o?: unknown) => Promise<LocalFile & { createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }> }>;
};

export const folderAccessSupported = () => typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';

export async function pickFolder(): Promise<LocalDir | null> {
  try {
    return await (window as PickerWindow).showDirectoryPicker!({ mode: 'read' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export interface LocalListing {
  name: string;
  kind: 'file' | 'folder';
  handle: LocalFile | LocalDir;
}

export async function listFolder(dir: LocalDir): Promise<LocalListing[]> {
  const out: LocalListing[] = [];
  for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind === 'directory' ? 'folder' : 'file', handle });
  return out;
}

/** Ask (via the browser prompt) for write access to a folder the user already granted for reading. */
export async function ensureWrite(dir: LocalDir): Promise<boolean> {
  if (!dir.requestPermission) return false;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function openTextFromComputer(): Promise<{ name: string; text: string; handle: LocalFile | null } | null> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ multiple: false });
      const file = await h.getFile();
      return { name: file.name, text: await readTextSafely(file), handle: h };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve({ name: f.name, text: await readTextSafely(f), handle: null });
      } catch (e) {
        reject(e);
      }
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/** Reads a file as text, refusing very large files and binary content. */
export async function readTextSafely(file: Blob & { name?: string }): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) throw new Error('That file is larger than 5 MB, which is too big for the text editor.');
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (head.includes(0)) throw new Error("That file looks like binary data, not text, so it can't be opened in the editor.");
  return file.text();
}

export async function saveTextToComputer(name: string, text: string, existing?: unknown): Promise<{ handle: unknown | null; name: string } | null> {
  const w = window as PickerWindow;
  type Writable = { createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }> };
  if (existing) {
    const stream = await (existing as Writable).createWritable();
    await stream.write(text);
    await stream.close();
    return { handle: existing, name };
  }
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Text', accept: { 'text/plain': ['.txt', '.md', '.json', '.csv'] } }] });
      const stream = await h.createWritable();
      await stream.write(text);
      await stream.close();
      return { handle: h, name: h.name };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
  return { handle: null, name };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
