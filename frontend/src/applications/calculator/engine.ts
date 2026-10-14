/**
 * Safe arithmetic evaluator — a small recursive-descent parser. It never uses eval()
 * or Function(); only numbers, + − × ÷ ^ % and parentheses are understood.
 */
export class CalcError extends Error {}

type Tok = { t: 'num'; v: number } | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '%' | '(' | ')' };

const OPS = new Set(['+', '-', '*', '/', '^', '%', '(', ')']);

function normalize(src: string): string {
  return src.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
}

export function tokenize(src: string): Tok[] {
  const s = normalize(src);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') {
      i++;
    } else if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      let dots = 0;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) {
        if (s[j] === '.') dots++;
        j++;
      }
      if (dots > 1 || (j - i === 1 && c === '.')) throw new CalcError('Invalid number');
      out.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
      i = j;
    } else if (OPS.has(c)) {
      out.push({ t: 'op', v: c as Extract<Tok, { t: 'op' }>['v'] });
      i++;
    } else throw new CalcError('Invalid expression');
  }
  return out;
}

export function evaluate(src: string): number {
  const toks = tokenize(src);
  if (toks.length === 0) throw new CalcError('Nothing to calculate');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = peek();
    return !!t && t.t === 'op' && t.v === v;
  };

  const expr = (): number => {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = power();
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as { v: string }).v;
      const r = power();
      if (op === '/') {
        if (r === 0) throw new CalcError('Cannot divide by zero');
        v /= r;
      } else v *= r;
    }
    return v;
  };
  const power = (): number => {
    const base = unary();
    if (isOp('^')) {
      p++;
      const exp = power(); // right-associative
      const r = Math.pow(base, exp);
      if (!Number.isFinite(r)) throw new CalcError('Result is too large');
      return r;
    }
    return base;
  };
  const unary = (): number => {
    if (isOp('-')) {
      p++;
      return -unary();
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return postfix();
  };
  const postfix = (): number => {
    let v = primary();
    while (isOp('%')) {
      p++;
      v /= 100;
    }
    return v;
  };
  const primary = (): number => {
    const t = toks[p++];
    if (!t) throw new CalcError('Incomplete expression');
    if (t.t === 'num') return t.v;
    if (t.v === '(') {
      const v = expr();
      if (!isOp(')')) throw new CalcError('Missing closing parenthesis');
      p++;
      return v;
    }
    throw new CalcError('Invalid expression');
  };

  const result = expr();
  if (p < toks.length) throw new CalcError(isOp(')') ? 'Unmatched parenthesis' : 'Invalid expression');
  if (!Number.isFinite(result)) throw new CalcError('Result is too large');
  // Trim binary floating-point noise (0.1 + 0.2 → 0.3).
  return Number(result.toPrecision(12));
}

export function formatResult(n: number): string {
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(n);
}
