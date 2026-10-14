import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENTS } from '@/app/constants';
import { contrastRatio, readableOn } from '@/utils/color';
import { normalizeUrl, hostOf } from '@/utils/url';
import { comboMatches, eventToCombo, isReservedCombo, prettyCombo } from '@/utils/shortcuts';
import { clamp, countWords, formatBytes, formatRelative, fromDateKey, toDateKey } from '@/utils/format';
import { sniffImage } from '@/services/wallpaperStorage';

describe('url safety', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['http://localhost:3000', 'http://localhost:3000/'],
    ['  www.wikipedia.org  ', 'https://www.wikipedia.org/'],
  ])('accepts %s', (input, out) => expect(normalizeUrl(input)).toBe(out));

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'vbscript:x', 'ftp://example.com', 'blob:https://x', '', '   ', 'not a url', 'localhost bad', 'singleword', 'https://', '//evil.com'])(
    'rejects %j',
    (input) => expect(normalizeUrl(input)).toBeNull(),
  );

  it('extracts a display host', () => {
    expect(hostOf('https://www.example.com/path')).toBe('example.com');
    expect(hostOf('garbage')).toBe('garbage');
  });
});

describe('shortcuts', () => {
  const ev = (o: Partial<KeyboardEvent>) => ({ code: 'KeyW', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o }) as KeyboardEvent;
  it('builds layout-independent combos from event.code', () => {
    expect(eventToCombo(ev({ altKey: true }))).toBe('Alt+KeyW');
    expect(eventToCombo(ev({ ctrlKey: true, shiftKey: true, code: 'KeyT' }))).toBe('Ctrl+Shift+KeyT');
    expect(eventToCombo(ev({ code: 'AltLeft', altKey: true }))).toBeNull(); // modifier alone
    expect(comboMatches(ev({ altKey: true }), 'Alt+KeyW')).toBe(true);
    expect(comboMatches(ev({ altKey: true, shiftKey: true }), 'Alt+KeyW')).toBe(false);
  });
  it('prettifies combos', () => {
    expect(prettyCombo('Alt+KeyW')).toBe('Alt + W');
    expect(prettyCombo('Alt+Period')).toBe('Alt + .');
    expect(prettyCombo('Alt+Space')).toBe('Alt + Space');
  });
  it('refuses browser-critical or modifier-less combos', () => {
    for (const c of ['Ctrl+KeyW', 'Ctrl+KeyT', 'Ctrl+KeyN', 'Meta+KeyQ', 'Alt+F4', 'Alt+Tab', 'KeyA', 'Shift+KeyA', 'F5']) expect(isReservedCombo(c)).toBe(true);
    for (const c of ['Alt+KeyJ', 'Alt+Space', 'Ctrl+Alt+KeyK']) expect(isReservedCombo(c)).toBe(false);
  });
});

describe('format helpers', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(formatBytes(-1)).toBe('—');
  });
  it('counts words and clamps', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  a  b\nc ')).toBe(3);
    expect(clamp(5, 0, 3)).toBe(3);
  });
  it('date keys round-trip in local time', () => {
    const d = new Date(2026, 0, 5, 23, 59);
    expect(toDateKey(d)).toBe('2026-01-05');
    expect(fromDateKey('2026-01-05').getDate()).toBe(5);
  });
  it('formats relative times', () => {
    const now = Date.now();
    expect(formatRelative(now - 5_000, now)).toBe('just now');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3 h ago');
  });
});

describe('image sniffing (wallpaper uploads)', () => {
  const blob = (bytes: number[]) => new Blob([new Uint8Array(bytes)]);
  it('accepts real image signatures', async () => {
    expect(await sniffImage(blob([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(true);
    expect(await sniffImage(blob([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(await sniffImage(blob([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(true);
    expect(await sniffImage(new Blob(['RIFF\0\0\0\0WEBPVP8 ']))).toBe(true);
  });
  it('rejects disguised non-images', async () => {
    expect(await sniffImage(new Blob(['<svg onload=alert(1)>']))).toBe(false);
    expect(await sniffImage(new Blob(['<html><script>alert(1)</script>']))).toBe(false);
    expect(await sniffImage(new Blob(['MZ\x90\0']))).toBe(false);
  });
});

describe('accessibility: colour contrast of design tokens', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');
  const block = (selector: string) => {
    const start = css.indexOf(selector);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
    return Object.fromEntries([...body.matchAll(/--s-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  };
  const dark = block(":root,\n:root[data-theme='dark']");
  const light = block(":root[data-theme='light']");

  it.each([
    ['dark', dark],
    ['light', light],
  ])('%s theme: body and secondary text meet WCAG AA (4.5:1) on every surface', (_n, t) => {
    for (const surface of [t.bg, t.surface, t['surface-2'], t.chrome]) {
      expect(contrastRatio(t.text, surface)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t['text-dim'], surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['text-faint'], surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(t.text, t['surface-3'])).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(t['text-dim'], t['surface-3'])).toBeGreaterThanOrEqual(4.5);
  });

  it('every accent colour is readable as text/UI on its theme surface (>= 4.5:1) and carries readable foreground text', () => {
    for (const [id, a] of Object.entries(ACCENTS)) {
      expect(contrastRatio(a.dark, dark.surface), `${id} on dark`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(a.light, light.surface), `${id} on light`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(a.dark, readableOn(a.dark)), `${id} fg dark`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(a.light, readableOn(a.light)), `${id} fg light`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('semantic colours (danger/success/warn) are readable on surfaces', () => {
    for (const [t, name] of [[dark, 'dark'], [light, 'light']] as const) {
      for (const k of ['danger', 'success', 'warn']) {
        const colour = t[k] ?? (name === 'dark' ? { danger: '#f08a8a', success: '#7bc98a', warn: '#e5b567' }[k] : undefined);
        expect(colour, `${k} ${name}`).toBeTruthy();
        expect(contrastRatio(colour!, t.surface), `${k} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
