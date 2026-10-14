import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '@/app/constants';
import { mergeSettings, useSettings } from '@/stores/settingsStore';
import { useApplySettings } from '@/hooks/useApplySettings';
import Settings from '@/applications/settings/Settings';
import { appProps, renderWithDialogs, resetAll } from './helpers';

function Harness() {
  useApplySettings();
  return <Settings {...appProps} />;
}

describe('settings & theming', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('persists settings to localStorage', () => {
    useSettings.getState().update({ theme: 'light', accent: 'teal', dock: { position: 'left' } });
    const saved = JSON.parse(localStorage.getItem('solace.settings.v1')!);
    expect(saved.state.settings.theme).toBe('light');
    expect(saved.state.settings.accent).toBe('teal');
    expect(saved.state.settings.dock.position).toBe('left');
    expect(saved.state.settings.dock.pinned).toEqual(DEFAULT_SETTINGS.dock.pinned); // nested merge keeps siblings
  });

  it('restores persisted theme after a reload (rehydration)', async () => {
    useSettings.getState().update({ theme: 'light', accent: 'rose' });
    const raw = localStorage.getItem('solace.settings.v1')!;
    useSettings.setState(useSettings.getInitialState(), true);
    expect(useSettings.getState().settings.theme).toBe('dark');
    localStorage.setItem('solace.settings.v1', raw);
    await act(async () => {
      await useSettings.persist.rehydrate();
    });
    expect(useSettings.getState().settings.theme).toBe('light');
    expect(useSettings.getState().settings.accent).toBe('rose');
  });

  it('mergeSettings fills in missing keys and ignores junk', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { theme: 'light', bogus: 1, dock: { position: 'right' }, density: 42 });
    expect(merged.theme).toBe('light');
    expect(merged.dock.position).toBe('right');
    expect(merged.dock.size).toBe(DEFAULT_SETTINGS.dock.size);
    expect(merged.density).toBe(DEFAULT_SETTINGS.density); // wrong type rejected
    expect((merged as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('applies theme, accent and radius tokens to the document immediately', async () => {
    render(<Harness />);
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(root.dataset.theme).toBe('light');
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    expect(root.style.getPropertyValue('--s-accent')).toBe('#0d6d66');
    await userEvent.click(screen.getByRole('radio', { name: 'Sharp' }));
    expect(root.style.getPropertyValue('--s-radius')).toBe('4px');
    await userEvent.click(screen.getByRole('radio', { name: 'Reduced' }));
    expect(root.dataset.motion).toBe('reduced');
  });

  it('resolves "system" theme from the OS preference', () => {
    useSettings.getState().update({ theme: 'system' });
    render(<Harness />);
    expect(['dark', 'light']).toContain(document.documentElement.dataset.theme);
  });

  it('switches sections and shows each one', async () => {
    render(<Harness />);
    for (const name of ['Wallpapers', 'Dock & taskbar', 'Keyboard shortcuts', 'Privacy', 'Storage', 'About Solace OS', 'Reset']) {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();
    }
  });

  it('restoring defaults keeps identity but resets appearance (with confirmation)', async () => {
    useSettings.getState().completeSetup({ displayName: 'Ada' });
    useSettings.getState().update({ theme: 'light', accent: 'amber' });
    renderWithDialogs(<Settings {...appProps} props={{ section: 'reset' }} />);
    await userEvent.click(screen.getByRole('button', { name: /restore defaults/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restore defaults' }));
    expect(useSettings.getState().settings.theme).toBe('dark');
    expect(useSettings.getState().settings.accent).toBe('lavender');
    expect(useSettings.getState().settings.displayName).toBe('Ada');
    expect(useSettings.getState().settings.setupComplete).toBe(true);
  });

  it('cancelling the restore-defaults confirmation changes nothing', async () => {
    useSettings.getState().update({ theme: 'light' });
    renderWithDialogs(<Settings {...appProps} props={{ section: 'reset' }} />);
    await userEvent.click(screen.getByRole('button', { name: /restore defaults/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(useSettings.getState().settings.theme).toBe('light');
  });

  it('lets the user rebind a shortcut and rejects reserved or duplicate combos', async () => {
    renderWithDialogs(<Settings {...appProps} props={{ section: 'shortcuts' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change shortcut for Open terminal' }));
    await userEvent.keyboard('{Control>}w{/Control}'); // reserved by the browser
    expect(await screen.findByRole('alert')).toHaveTextContent(/modifier|browser/i);
    await userEvent.keyboard('{Alt>}d{/Alt}'); // already "Show desktop"
    expect(await screen.findByRole('alert')).toHaveTextContent(/already used/i);
    await userEvent.keyboard('{Alt>}j{/Alt}');
    expect(useSettings.getState().settings.shortcuts.openTerminal).toBe('Alt+KeyJ');
    await userEvent.click(screen.getByRole('button', { name: 'Reset shortcut for Open terminal' }));
    expect(useSettings.getState().settings.shortcuts.openTerminal).toBe(DEFAULT_SHORTCUTS.openTerminal);
  });
});
