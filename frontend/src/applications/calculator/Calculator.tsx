import { useCallback, useRef, useState } from 'react';
import { Delete, History, Trash2 } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { CalcError, evaluate, formatResult } from './engine';
import { useCalcHistory } from './calcStore';
import { cn } from '@/utils/cn';

const KEYS: Array<{ label: string; value: string; kind: 'num' | 'op' | 'fn' | 'eq'; aria?: string }> = [
  { label: 'C', value: 'clear', kind: 'fn', aria: 'Clear' },
  { label: '(', value: '(', kind: 'fn' },
  { label: ')', value: ')', kind: 'fn' },
  { label: '÷', value: '÷', kind: 'op', aria: 'Divide' },
  { label: '7', value: '7', kind: 'num' },
  { label: '8', value: '8', kind: 'num' },
  { label: '9', value: '9', kind: 'num' },
  { label: '×', value: '×', kind: 'op', aria: 'Multiply' },
  { label: '4', value: '4', kind: 'num' },
  { label: '5', value: '5', kind: 'num' },
  { label: '6', value: '6', kind: 'num' },
  { label: '−', value: '−', kind: 'op', aria: 'Subtract' },
  { label: '1', value: '1', kind: 'num' },
  { label: '2', value: '2', kind: 'num' },
  { label: '3', value: '3', kind: 'num' },
  { label: '+', value: '+', kind: 'op', aria: 'Add' },
  { label: '%', value: '%', kind: 'fn', aria: 'Percent' },
  { label: '0', value: '0', kind: 'num' },
  { label: '.', value: '.', kind: 'num', aria: 'Decimal point' },
  { label: '=', value: '=', kind: 'eq', aria: 'Equals' },
];

const OPERATORS = '+−×÷^';

export default function Calculator(_props: AppComponentProps) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const justEvaluated = useRef(false);
  const { history, add, clear } = useCalcHistory();

  const press = useCallback(
    (v: string) => {
      setError(null);
      if (v === 'clear') {
        setExpr('');
        setResult(null);
        justEvaluated.current = false;
        return;
      }
      if (v === 'back') {
        if (justEvaluated.current) {
          setExpr('');
          setResult(null);
          justEvaluated.current = false;
        } else setExpr((e) => e.slice(0, -1));
        return;
      }
      if (v === '=') {
        if (!expr.trim()) return;
        try {
          const r = formatResult(evaluate(expr));
          add(expr, r);
          setResult(r);
          setExpr(r);
          justEvaluated.current = true;
        } catch (e) {
          setError(e instanceof CalcError ? e.message : 'Invalid expression');
        }
        return;
      }
      const isOp = OPERATORS.includes(v);
      let base = expr;
      if (justEvaluated.current) {
        // After "=", an operator continues from the result; a digit starts fresh.
        base = isOp || v === '%' ? expr : '';
        justEvaluated.current = false;
        setResult(null);
      }
      const last = base.slice(-1);
      let next = base + v;
      if (isOp && last && OPERATORS.includes(last) && !(v === '−' && last !== '−')) {
        // Replace a trailing operator instead of stacking two (a minus after another operator is a sign).
        next = base.slice(0, -1) + v;
      } else if (isOp && !base && v !== '−') {
        next = base;
      } else if (v === '.' && (base.split(/[+−×÷^()%]/).pop() ?? '').includes('.')) {
        next = base;
      }
      setExpr(next);
    },
    [expr, add],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map: Record<string, string> = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear' };
    const k = map[e.key] ?? e.key;
    if (/^[0-9.+×÷−()%^=]$/.test(k) || k === 'back' || k === 'clear') {
      e.preventDefault();
      press(k);
    }
  };

  const display = error ?? (expr || '0');

  return (
    <div className="flex h-full" onKeyDown={onKeyDown} tabIndex={0} aria-label="Calculator" role="application">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-[110px] flex-col justify-end gap-1 border-b border-line bg-surface2 px-4 pt-3 pb-3">
          <button className={cn('s-icon-btn absolute top-2 left-2', showHistory && '!bg-accentsoft !text-accent')} aria-label="Toggle history" aria-pressed={showHistory} title="History" onClick={() => setShowHistory((v) => !v)}>
            <History size={16} />
          </button>
          <div className="h-5 truncate text-right text-[12.5px] text-dim" aria-hidden>
            {result !== null ? 'Result' : ''}
          </div>
          <output aria-live="polite" data-testid="calc-display" className={cn('block overflow-hidden text-right font-light tabular-nums text-ellipsis whitespace-nowrap', error ? 'text-[16px] text-danger' : display.length > 14 ? 'text-[24px]' : 'text-[38px]')}>
            {display}
          </output>
        </div>
        <div className="grid flex-1 grid-cols-4 gap-1.5 p-2.5">
          {KEYS.map((k) => (
            <button
              key={k.label}
              aria-label={k.aria ?? k.label}
              onClick={() => press(k.value)}
              className={cn(
                'rounded-[var(--s-radius-sm)] border text-[17px] transition-colors',
                k.kind === 'eq' ? 'border-accent bg-accent font-semibold text-accentfg hover:brightness-110' : k.kind === 'op' ? 'border-line2 bg-surface3 text-accent hover:bg-surface2' : k.kind === 'fn' ? 'border-line bg-surface2 text-dim hover:bg-surface3' : 'border-line bg-surface hover:bg-surface3',
              )}
            >
              {k.label}
            </button>
          ))}
          <button className="col-span-4 -mt-0.5 flex h-8 items-center justify-center gap-1.5 rounded-[var(--s-radius-sm)] border border-line bg-surface2 text-[12.5px] text-dim hover:bg-surface3" aria-label="Backspace" onClick={() => press('back')}>
            <Delete size={14} /> Backspace
          </button>
        </div>
      </div>
      {showHistory && (
        <aside className="flex w-[200px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Calculation history">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="s-label">History</span>
            <button className="s-icon-btn" aria-label="Clear history" title="Clear history" disabled={history.length === 0} onClick={clear}>
              <Trash2 size={14} />
            </button>
          </div>
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1.5">
            {history.length === 0 && <li className="p-3 text-center text-[12.5px] text-dim">No calculations yet.</li>}
            {history.map((h) => (
              <li key={h.id}>
                <button
                  className="w-full rounded-[var(--s-radius-sm)] border-0 bg-transparent px-2 py-1.5 text-right hover:bg-surface3"
                  onClick={() => {
                    setExpr(h.result);
                    setResult(null);
                    setError(null);
                    justEvaluated.current = true;
                  }}
                >
                  <div className="truncate text-[12px] text-dim">{h.expr} =</div>
                  <div className="truncate text-[15px] text-ink">{h.result}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
