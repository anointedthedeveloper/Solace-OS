export function findMatches(text: string, query: string, caseSensitive: boolean): number[] {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: number[] = [];
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    out.push(i);
    i += Math.max(1, needle.length);
  }
  return out;
}

export function replaceAllMatches(text: string, query: string, replacement: string, caseSensitive: boolean): { text: string; count: number } {
  const idx = findMatches(text, query, caseSensitive);
  if (idx.length === 0) return { text, count: 0 };
  let out = '';
  let last = 0;
  for (const i of idx) {
    out += text.slice(last, i) + replacement;
    last = i + query.length;
  }
  return { text: out + text.slice(last), count: idx.length };
}

export function lineCol(text: string, pos: number): { line: number; col: number } {
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  return { line, col: pos - (before.lastIndexOf('\n') + 1) + 1 };
}
