import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app/App';
import { useSettings } from '@/stores/settingsStore';
import { useWidgets } from '@/stores/widgetStore';
import { useWindows } from '@/stores/windowStore';
import { resetAll } from './helpers';

describe('first-run experience', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('shows the welcome screen with logo, name and tagline on first visit', async () => {
    render(<App />);
    expect(await screen.findByTestId('welcome')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome to Solace OS' })).toBeInTheDocument();
    expect(screen.getByText('Everything in its place.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Solace OS logo' })).toBeInTheDocument();
  });

  it('lets the user choose appearance, accent and a display name, then enter the desktop', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /get started/i }));
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light'); // live preview
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Ada Lovelace');
    await userEvent.click(screen.getByRole('button', { name: /enter solace/i }));
    expect(await screen.findByTestId('desktop')).toBeInTheDocument();
    const s = useSettings.getState().settings;
    expect(s).toMatchObject({ setupComplete: true, theme: 'light', accent: 'teal', displayName: 'Ada Lovelace' });
    expect(useWidgets.getState().widgets.map((w) => w.type)).toEqual(['clock']);
  });

  it('requires no personal information — the name is optional', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /get started/i }));
    await userEvent.click(screen.getByRole('button', { name: /enter solace/i }));
    expect(await screen.findByTestId('desktop')).toBeInTheDocument();
    expect(useSettings.getState().settings.displayName).toBe('');
  });

  it('saves the preferences so the next visit goes straight to the desktop', async () => {
    useSettings.getState().update({ theme: 'light' });
    useSettings.getState().completeSetup({ displayName: 'Ada' });
    render(<App />);
    expect(await screen.findByTestId('desktop')).toBeInTheDocument();
    expect(screen.queryByTestId('welcome')).not.toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('restores open windows on startup, or starts clean if the setting is off', async () => {
    useSettings.getState().completeSetup({ displayName: '' });
    useWindows.getState().openApp('notes');
    const { unmount } = render(<App />);
    expect(await screen.findByRole('group', { name: 'Notes window' })).toBeInTheDocument();
    unmount();
    useSettings.getState().update({ windows: { restoreOnStartup: false } });
    render(<App />);
    await screen.findByTestId('desktop');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notes window' })).not.toBeInTheDocument());
  });

  it('applies design tokens for density, icon size and corner radius', async () => {
    useSettings.getState().completeSetup({ displayName: '' });
    useSettings.getState().update({ density: 'compact', desktopIcons: { size: 'large' }, windows: { corners: 'round' } });
    render(<App />);
    await screen.findByTestId('desktop');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--s-density')).toBe('0.88');
    expect(root.getPropertyValue('--s-icon-size')).toBe('80px');
    expect(root.getPropertyValue('--s-radius')).toBe('16px');
    expect(within(screen.getByTestId('desktop')).getByRole('navigation', { name: 'Taskbar' })).toBeInTheDocument();
  });
});
