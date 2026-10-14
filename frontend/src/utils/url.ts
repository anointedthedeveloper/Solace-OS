/**
 * Normalise user input into a safe, navigable http(s) URL.
 * Returns null for anything else (javascript:, data:, file:, malformed…).
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw) || raw.startsWith('/')) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return null;
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
