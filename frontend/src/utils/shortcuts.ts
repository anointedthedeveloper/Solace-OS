/** Shortcuts are stored as "Alt+KeyW" style strings and matched on KeyboardEvent.code,
 *  so they are layout independent and unaffected by Alt-composed characters on macOS. */
const MODS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

export function eventToCombo(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.test(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.code);
  return parts.join('+');
}

export function comboMatches(e: KeyboardEvent, combo: string): boolean {
  return eventToCombo(e) === combo;
}

export function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      if ((MODS as readonly string[]).includes(p)) return p;
      if (p.startsWith('Key')) return p.slice(3);
      if (p.startsWith('Digit')) return p.slice(5);
      const map: Record<string, string> = {
        Space: 'Space',
        Enter: 'Enter',
        Escape: 'Esc',
        Period: '.',
        Comma: ',',
        Slash: '/',
        Backslash: '\\',
        BracketLeft: '[',
        BracketRight: ']',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
      };
      return map[p] ?? p;
    })
    .join(' + ');
}

/** Combos that would collide with browser-critical commands and are therefore refused. */
export function isReservedCombo(combo: string): boolean {
  const reserved = new Set([
    'Ctrl+KeyW', 'Ctrl+KeyT', 'Ctrl+KeyN', 'Ctrl+KeyR', 'Ctrl+KeyL', 'Ctrl+KeyQ',
    'Ctrl+Tab', 'Ctrl+Shift+KeyT', 'Ctrl+Shift+KeyN', 'Ctrl+KeyS', 'Ctrl+KeyP',
    'Meta+KeyW', 'Meta+KeyT', 'Meta+KeyQ', 'Meta+KeyR', 'Meta+KeyL', 'Meta+KeyN',
    'Alt+F4', 'Alt+Tab', 'F5', 'F11', 'F12', 'Alt+ArrowLeft', 'Alt+ArrowRight',
  ]);
  return reserved.has(combo) || !/(Ctrl|Alt|Meta)/.test(combo);
}
