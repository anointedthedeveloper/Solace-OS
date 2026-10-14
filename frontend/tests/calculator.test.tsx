import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalcError, evaluate, formatResult } from '@/applications/calculator/engine';
import Calculator from '@/applications/calculator/Calculator';
import { useCalcHistory } from '@/applications/calculator/calcStore';
import { appProps } from './helpers';

describe('calculator engine', () => {
  it.each([
    ['1+2', 3],
    ['2+3×4', 14],
    ['(2+3)×4', 20],
    ['10÷4', 2.5],
    ['10−2−3', 5],
    ['2^3^2', 512],
    ['−5+3', -2],
    ['5×−3', -15],
    ['50%', 0.5],
    ['200×10%', 20],
    ['0.1+0.2', 0.3],
    ['1.5×2', 3],
    ['((1+2)×(3+4))', 21],
    ['2*3/4', 1.5],
  ])('%s = %s', (expr, expected) => {
    expect(evaluate(expr)).toBeCloseTo(expected as number, 10);
  });

  it('rejects division by zero', () => {
    expect(() => evaluate('1÷0')).toThrow('Cannot divide by zero');
    expect(() => evaluate('5÷(2−2)')).toThrow(CalcError);
  });

  it.each(['', '2+', '×3', '(1+2', '1+2)', '1..2', 'abc', '2 3', '1+*2'])('rejects invalid input %j', (expr) => {
    expect(() => evaluate(expr)).toThrow(CalcError);
  });

  it('never executes code — identifiers and calls are just invalid input', () => {
    expect(() => evaluate('alert(1)')).toThrow(CalcError);
    expect(() => evaluate('process.exit()')).toThrow(CalcError);
    expect(() => evaluate('1;2')).toThrow(CalcError);
    expect(() => evaluate('constructor')).toThrow(CalcError);
  });

  it('guards against overflow', () => {
    expect(() => evaluate('9^9^9')).toThrow(/too large/i);
  });

  it('formats very large and small results compactly', () => {
    expect(formatResult(0.5)).toBe('0.5');
    expect(formatResult(1e21)).toContain('e');
  });
});

describe('Calculator app', () => {
  beforeEach(() => {
    useCalcHistory.setState({ history: [] });
  });

  const display = () => screen.getByTestId('calc-display');
  const press = async (...labels: string[]) => {
    for (const l of labels) await userEvent.click(screen.getByRole('button', { name: l }));
  };

  it('does basic arithmetic with the on-screen keys', async () => {
    render(<Calculator {...appProps} />);
    await press('7', 'Multiply', '6', 'Equals');
    expect(display()).toHaveTextContent('42');
  });

  it('respects operator precedence', async () => {
    render(<Calculator {...appProps} />);
    await press('2', 'Add', '3', 'Multiply', '4', 'Equals');
    expect(display()).toHaveTextContent('14');
  });

  it('supports decimals and blocks a second decimal point in one number', async () => {
    render(<Calculator {...appProps} />);
    await press('1', 'Decimal point', '5', 'Decimal point', '5', 'Add', '1', 'Equals');
    expect(display()).toHaveTextContent('2.55');
  });

  it('accepts keyboard input', async () => {
    render(<Calculator {...appProps} />);
    await userEvent.click(screen.getByRole('application'));
    await userEvent.keyboard('12*3{Enter}');
    expect(display()).toHaveTextContent('36');
    await userEvent.keyboard('{Backspace}');
    expect(display()).toHaveTextContent('0');
  });

  it('backspace removes the last character and clear resets', async () => {
    render(<Calculator {...appProps} />);
    await press('1', '2', '3', 'Backspace');
    expect(display()).toHaveTextContent('12');
    await press('Clear');
    expect(display()).toHaveTextContent('0');
  });

  it('shows an error for division by zero and recovers', async () => {
    render(<Calculator {...appProps} />);
    await press('5', 'Divide', '0', 'Equals');
    expect(display()).toHaveTextContent('Cannot divide by zero');
    await press('Clear', '2', 'Add', '2', 'Equals');
    expect(display()).toHaveTextContent('4');
  });

  it('replaces a trailing operator instead of stacking two', async () => {
    render(<Calculator {...appProps} />);
    await press('5', 'Add', 'Multiply', '2', 'Equals');
    expect(display()).toHaveTextContent('10');
  });

  it('keeps a history and can reload a result from it', async () => {
    render(<Calculator {...appProps} />);
    await press('2', 'Add', '2', 'Equals');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle history' }));
    const hist = screen.getByRole('complementary', { name: /history/i });
    expect(within(hist).getByText('2+2 =')).toBeInTheDocument();
    await press('Clear');
    await userEvent.click(within(hist).getByText('2+2 =').closest('button')!);
    expect(display()).toHaveTextContent('4');
    await userEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(within(hist).getByText(/no calculations yet/i)).toBeInTheDocument();
  });

  it('continues from the previous result when an operator follows equals', async () => {
    render(<Calculator {...appProps} />);
    await press('6', 'Multiply', '7', 'Equals', 'Add', '8', 'Equals');
    expect(display()).toHaveTextContent('50');
  });
});
