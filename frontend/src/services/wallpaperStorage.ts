import { idbDel, idbGet, idbSet } from './idb';

const KEY = 'custom-wallpaper';
export const MAX_WALLPAPER_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

/** Check the file's magic bytes, not just the extension / declared MIME type. */
export async function sniffImage(file: Blob): Promise<boolean> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('89504e47')) return true; // PNG
  if (hex.startsWith('ffd8ff')) return true; // JPEG
  if (hex.startsWith('47494638')) return true; // GIF
  const ascii = String.fromCharCode(...buf);
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return true;
  if (ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 16))) return true;
  return false;
}

export async function saveCustomWallpaper(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ALLOWED.includes(file.type)) return { ok: false, error: 'Please choose a PNG, JPEG, WebP, GIF or AVIF image.' };
  if (file.size > MAX_WALLPAPER_BYTES) return { ok: false, error: 'That image is larger than 8 MB.' };
  if (!(await sniffImage(file))) return { ok: false, error: 'That file does not look like a valid image.' };
  await idbSet('blobs', KEY, file);
  window.dispatchEvent(new Event('solace:wallpaper'));
  return { ok: true };
}

export async function loadCustomWallpaper(): Promise<Blob | undefined> {
  return idbGet<Blob>('blobs', KEY);
}

export async function clearCustomWallpaper(): Promise<void> {
  await idbDel('blobs', KEY);
  window.dispatchEvent(new Event('solace:wallpaper'));
}
