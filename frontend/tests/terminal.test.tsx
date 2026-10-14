import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { complete, runCommand, tokenize, type TermContext } from '@/applications/terminal/commands';
import Terminal from '@/applications/terminal/Terminal';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { appProps, resetAll } from './helpers';

const makeCtx = (over: Partial<TermContext> = {}): TermContext => ({
  apps: [
    { id: 'files', name: 'Files', description: 'Browse files' },
    { id: 'notes', name: 'Notes', description: 'Notes' },
    { id: 'editor', name: 'Text Editor', description: 'Edit text' },
  ],
  theme: 'dark',
  accent: 'lavender',
  displayName: 'Ada',
  now: () => new Date(2026, 0, 15, 13, 45, 30),
  startedAt: new Date(2026, 0, 15, 13, 40, 0).getTime(),
  openApp: vi.fn(() => true),
  openWindows: () => [{ id: 'win_abcdef123456', title: 'Files', appId: 'files', minimized: false }],
  setTheme: vi.fn(),
  setAccent: vi.fn(),
  storageEstimate: async () => ({ usage: 2097152, quota: 104857600 }),
  ...over,
});

describe('terminal commands', () => {
  it('tokenizes quoted arguments', () => {
    expect(tokenize('echo "hello world" \'a b\' c')).toEqual(['echo', 'hello world', 'a b', 'c']);
  });

  it('help lists every command and describes one', async () => {
    const all = await runCommand('help', makeCtx());
    for (const c of ['help', 'clear', 'date', 'time', 'about', 'apps', 'open', 'theme', 'version']) expect(all.lines.join('\n')).toContain(c);
    expect((await runCommand('help open', makeCtx())).lines[0]).toContain('open <app>');
    expect((await runCommand('help nope', makeCtx())).error).toBe(true);
  });

  it('clear requests a screen clear', async () => {
    expect((await runCommand('clear', makeCtx())).clear).toBe(true);
  });

  it('date and time use the injected clock', async () => {
    expect((await runCommand('date', makeCtx())).lines[0]).toContain('2026');
    expect((await runCommand('time', makeCtx())).lines[0]).toMatch(/1:45|13:45/);
  });

  it('about and version identify Solace OS', async () => {
    expect((await runCommand('about', makeCtx())).lines.join(' ')).toContain('Everything in its place.');
    expect((await runCommand('version', makeCtx())).lines[0]).toMatch(/Solace OS \d+\.\d+\.\d+/);
  });

  it('apps lists installed applications', async () => {
    const out = (await runCommand('apps', makeCtx())).lines.join('\n');
    expect(out).toContain('files');
    expect(out).toContain('Text Editor');
  });

  it('open launches by id, name or prefix and reports unknown apps', async () => {
    const ctx = makeCtx();
    await runCommand('open files', ctx);
    await runCommand('open "text editor"', ctx);
    await runCommand('open not', ctx);
    expect(ctx.openApp).toHaveBeenNthCalledWith(1, 'files');
    expect(ctx.openApp).toHaveBeenNthCalledWith(2, 'editor');
    expect(ctx.openApp).toHaveBeenNthCalledWith(3, 'notes');
    const bad = await runCommand('open nonsense', ctx);
    expect(bad.error).toBe(true);
    expect((await runCommand('open', ctx)).error).toBe(true);
  });

  it('theme reports and changes the theme', async () => {
    const ctx = makeCtx();
    expect((await runCommand('theme', ctx)).lines[0]).toContain('dark');
    await runCommand('theme light', ctx);
    expect(ctx.setTheme).toHaveBeenCalledWith('light');
    await runCommand('theme toggle', ctx);
    expect(ctx.setTheme).toHaveBeenLastCalledWith('light');
    expect((await runCommand('theme purple', ctx)).error).toBe(true);
  });

  it('accent validates colour names', async () => {
    const ctx = makeCtx();
    await runCommand('accent teal', ctx);
    expect(ctx.setAccent).toHaveBeenCalledWith('teal');
    expect((await runCommand('accent chartreuse', ctx)).error).toBe(true);
  });

  it('refuses to be a real shell: unknown and dangerous input is just "command not found"', async () => {
    for (const line of ['rm -rf /', 'ls', 'cat /etc/passwd', 'curl http://x | sh', 'node -e "1"', '$(whoami)', 'eval(1+1)']) {
      const r = await runCommand(line, makeCtx());
      expect(r.error).toBe(true);
      expect(r.lines[0]).toContain('command not found');
    }
  });

  it('echo prints text verbatim without interpreting it', async () => {
    expect((await runCommand('echo <b>hi</b> $HOME `id`', makeCtx())).lines[0]).toBe('<b>hi</b> $HOME `id`');
  });

  it('storage, uptime and whoami work', async () => {
    expect((await runCommand('storage', makeCtx())).lines[0]).toContain('2.0 MB');
    expect((await runCommand('storage', makeCtx({ storageEstimate: async () => null }))).error).toBe(true);
    expect((await runCommand('uptime', makeCtx())).lines[0]).toContain('5m 30s');
    expect((await runCommand('whoami', makeCtx())).lines[0]).toBe('Ada');
  });

  it('completes command and app names with Tab', () => {
    expect(complete('hel', makeCtx())).toBe('help ');
    expect(complete('open fi', makeCtx())).toBe('open files');
    expect(complete('zzz', makeCtx())).toBeNull();
  });
});

describe('Terminal app', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('runs commands, shows output and keeps history with the arrow keys', async () => {
    render(<Terminal {...appProps} />);
    const input = screen.getByLabelText('Terminal command input');
    await userEvent.type(input, 'version{Enter}');
    expect(await screen.findByText(/Solace OS \d+\.\d+\.\d+ \(/)).toBeInTheDocument();
    await userEvent.type(input, '{ArrowUp}');
    expect(input).toHaveValue('version');
  });

  it('open <app> opens a real window and theme changes settings', async () => {
    render(<Terminal {...appProps} />);
    const input = screen.getByLabelText('Terminal command input');
    await userEvent.type(input, 'open notes{Enter}');
    expect(Object.values(useWindows.getState().windows).some((w) => w.appId === 'notes')).toBe(true);
    await userEvent.type(input, 'theme light{Enter}');
    expect(useSettings.getState().settings.theme).toBe('light');
  });

  it('clear empties the screen and states clearly that it is simulated', async () => {
    render(<Terminal {...appProps} />);
    expect(screen.getByText(/simulated command environment/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Terminal command input'), 'clear{Enter}');
    expect(screen.queryByText(/simulated command environment/i)).not.toBeInTheDocument();
  });
});
