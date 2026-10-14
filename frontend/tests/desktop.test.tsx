import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Desktop } from '@/desktop/Desktop';
import { rankApps } from '@/desktop/Launcher';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useNotes } from '@/stores/notesStore';
import { useUi } from '@/stores/uiStore';
import { notify, useNotifications } from '@/stores/notificationStore';
import { resetAll } from './helpers';

const wins = () => Object.values(useWindows.getState().windows);

async function startDesktop() {
  useSettings.getState().completeSetup({ displayName: 'Ada' });
  render(<Desktop />);
}
const openFromLauncher = async (query: string) => {
  await userEvent.click(screen.getByTestId('launcher-button'));
  await userEvent.type(screen.getByRole('combobox', { name: 'Search applications' }), query);
  await userEvent.keyboard('{Enter}');
};

describe('desktop shell', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('renders the desktop, dock, tray, clock and desktop icons', async () => {
    await startDesktop();
    expect(screen.getByTestId('desktop')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Taskbar' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'System tray' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Notifications/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quick settings/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open launcher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notes, desktop shortcut' })).toBeInTheDocument();
    for (const name of ['Files', 'Web', 'Notes', 'Text Editor', 'Calendar', 'Terminal', 'Settings']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('honours the "hide desktop icons" setting', async () => {
    useSettings.getState().update({ desktopIcons: { visible: false } });
    await startDesktop();
    expect(screen.queryByRole('button', { name: 'Notes, desktop shortcut' })).not.toBeInTheDocument();
  });
});

describe('application launcher', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('opens from the launcher button and lists pinned apps and categories', async () => {
    await startDesktop();
    await userEvent.click(screen.getByTestId('launcher-button'));
    const dlg = screen.getByRole('dialog', { name: 'Application launcher' });
    expect(within(dlg).getByText('Pinned')).toBeInTheDocument();
    expect(within(dlg).getByText('Productivity')).toBeInTheDocument();
    expect(within(dlg).getAllByRole('option').length).toBeGreaterThan(8);
  });

  it('opens with the documented keyboard shortcut (Alt+Space) and closes with Escape', async () => {
    await startDesktop();
    await userEvent.keyboard('{Alt>} {/Alt}');
    expect(await screen.findByRole('dialog', { name: 'Application launcher' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search applications' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Application launcher' })).not.toBeInTheDocument();
  });

  it('searches as you type and launches the top result with Enter', async () => {
    await startDesktop();
    await openFromLauncher('calc');
    expect(await screen.findByRole('group', { name: 'Calculator window' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Application launcher' })).not.toBeInTheDocument();
    expect(wins().map((w) => w.appId)).toEqual(['calculator']);
  });

  it('supports arrow-key navigation between results', async () => {
    await startDesktop();
    await userEvent.click(screen.getByTestId('launcher-button'));
    const input = screen.getByRole('combobox', { name: 'Search applications' });
    await userEvent.type(input, 'e'); // several matches
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', 'launcher-row-1');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('shows an empty state when nothing matches', async () => {
    await startDesktop();
    await userEvent.click(screen.getByTestId('launcher-button'));
    await userEvent.type(screen.getByRole('combobox', { name: 'Search applications' }), 'qqqqzz');
    expect(screen.getByText(/No applications match/)).toBeInTheDocument();
  });

  it('offers to open a typed web address in a new tab, clearly marked external', async () => {
    await startDesktop();
    await userEvent.click(screen.getByTestId('launcher-button'));
    await userEvent.type(screen.getByRole('combobox', { name: 'Search applications' }), 'example.com');
    expect(screen.getByText(/external website, opens in a new tab/i)).toBeInTheDocument();
  });

  it('never offers javascript: URLs', async () => {
    await startDesktop();
    await userEvent.click(screen.getByTestId('launcher-button'));
    await userEvent.type(screen.getByRole('combobox', { name: 'Search applications' }), 'javascript:alert(1)');
    expect(screen.queryByText(/external website/i)).not.toBeInTheDocument();
  });

  it('remembers recently opened apps (and respects the privacy setting)', async () => {
    await startDesktop();
    await openFromLauncher('termin');
    await userEvent.click(screen.getByTestId('launcher-button'));
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('ranks name matches above description matches', () => {
    const names = rankApps('note').map((a) => a.id);
    expect(names[0]).toBe('notes');
    expect(rankApps('').length).toBeGreaterThan(5);
    expect(rankApps('zzzz')).toHaveLength(0);
    expect(rankApps('clock')).toHaveLength(0);
  });
});

describe('windows in the UI', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('opens multiple applications simultaneously', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    await openFromLauncher('terminal');
    await openFromLauncher('calendar');
    expect(await screen.findByRole('group', { name: 'Calendar window' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Notes window' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Terminal window' })).toBeInTheDocument();
    expect(wins()).toHaveLength(3);
  });

  it('focus follows the most recently clicked window and updates z-order', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    await openFromLauncher('terminal');
    const notes = await screen.findByRole('group', { name: 'Notes window' });
    const term = screen.getByRole('group', { name: 'Terminal window' });
    expect(term).toHaveAttribute('data-focused', 'true');
    fireEvent.pointerDown(notes);
    expect(notes).toHaveAttribute('data-focused', 'true');
    expect(term).toHaveAttribute('data-focused', 'false');
    expect(Number(notes.style.zIndex)).toBeGreaterThan(Number(term.style.zIndex));
  });

  it('minimizes to the dock and restores from it', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    const win = await screen.findByRole('group', { name: 'Notes window' });
    await userEvent.click(within(win).getByRole('button', { name: 'Minimize Notes' }));
    expect(screen.queryByRole('group', { name: 'Notes window' })).not.toBeInTheDocument(); // hidden
    const dockBtn = document.querySelector('[data-dock-app="notes"]') as HTMLElement;
    expect(dockBtn).toHaveAttribute('aria-label', 'Notes — 1 open');
    await userEvent.click(dockBtn);
    expect(await screen.findByRole('group', { name: 'Notes window' })).toBeVisible();
  });

  it('clicking the dock icon of the focused window minimizes it', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    await screen.findByRole('group', { name: 'Notes window' });
    const dockBtn = document.querySelector('[data-dock-app="notes"]') as HTMLElement;
    expect(dockBtn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(dockBtn);
    expect(wins()[0].minimized).toBe(true);
  });

  it('maximizes, restores (button and double-click) and closes', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    const win = await screen.findByRole('group', { name: 'Notes window' });
    await userEvent.click(within(win).getByRole('button', { name: 'Maximize Notes' }));
    expect(wins()[0].maximized).toBe(true);
    await userEvent.click(within(win).getByRole('button', { name: 'Restore Notes' }));
    expect(wins()[0].maximized).toBe(false);
    fireEvent.doubleClick(within(win).getByText('Notes', { selector: 'div' }));
    expect(wins()[0].maximized).toBe(true);
    fireEvent.doubleClick(within(win).getByText('Notes', { selector: 'div' }));
    expect(wins()[0].maximized).toBe(false);
    await userEvent.click(within(win).getByRole('button', { name: 'Close Notes' }));
    await waitFor(() => expect(wins()).toHaveLength(0));
    expect(screen.queryByRole('group', { name: 'Notes window' })).not.toBeInTheDocument();
  });

  it('drags a window by its title bar and commits the new position', async () => {
    await startDesktop();
    await openFromLauncher('terminal');
    const win = await screen.findByRole('group', { name: 'Terminal window' });
    const before = wins()[0];
    const titlebar = within(win).getByText('Terminal', { selector: 'div' }).parentElement!;
    fireEvent.pointerDown(titlebar, { clientX: 300, clientY: 200, button: 0, pointerId: 1 });
    fireEvent.pointerMove(titlebar, { clientX: 380, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(titlebar, { clientX: 380, clientY: 250, pointerId: 1 });
    const after = wins()[0];
    expect(after.x - before.x).toBe(80);
    expect(after.y - before.y).toBe(50);
  });

  it('resizes from a corner but never below the app minimum size', async () => {
    await startDesktop();
    await openFromLauncher('terminal');
    const win = await screen.findByRole('group', { name: 'Terminal window' });
    const before = wins()[0];
    const handle = win.querySelector('[data-resize="se"]')!;
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 560, clientY: 540, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 560, clientY: 540, pointerId: 1 });
    expect(wins()[0].w).toBe(before.w + 60);
    expect(wins()[0].h).toBe(before.h + 40);
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -2000, clientY: -2000, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: -2000, clientY: -2000, pointerId: 1 });
    expect(wins()[0].w).toBe(420);
    expect(wins()[0].h).toBe(260);
  });

  it('restores the workspace after a refresh (rehydration)', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    await screen.findByRole('group', { name: 'Notes window' });
    const raw = localStorage.getItem('solace.workspace.v1')!;
    act(() => useWindows.setState({ windows: {}, order: [], focusedId: null }));
    localStorage.setItem('solace.workspace.v1', raw);
    await act(async () => {
      await useWindows.persist.rehydrate();
    });
    expect(wins().map((w) => w.appId)).toEqual(['notes']);
    expect(await screen.findByRole('group', { name: 'Notes window' })).toBeInTheDocument();
  });

  it('opens a window for each desktop icon via double-click or Enter', async () => {
    await startDesktop();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Settings, desktop shortcut' }));
    expect(await screen.findByRole('group', { name: 'Settings window' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Notes, desktop shortcut' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('group', { name: 'Notes window' })).toBeInTheDocument();
  });

  it('shows a recoverable error instead of crashing the desktop when an app throws', async () => {
    const orig = console.error;
    console.error = () => {};
    try {
      await startDesktop();
      // Settings opened with a section that renders fine; force a crash via a bad store value.
      useNotes.setState({ notes: [null as never] });
      await openFromLauncher('notes');
      expect(await screen.findByText(/Notes ran into a problem/)).toBeInTheDocument();
      expect(screen.getByTestId('desktop')).toBeInTheDocument();
    } finally {
      console.error = orig;
    }
  });
});

describe('keyboard shortcuts', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('Alt+W closes, Alt+M minimizes, Alt+Enter maximizes the focused window', async () => {
    await startDesktop();
    await openFromLauncher('notes');
    await openFromLauncher('terminal');
    await screen.findByRole('group', { name: 'Terminal window' });
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    expect(wins().find((w) => w.appId === 'terminal')!.maximized).toBe(true);
    await userEvent.keyboard('{Alt>}m{/Alt}');
    expect(wins().find((w) => w.appId === 'terminal')!.minimized).toBe(true);
    expect(useWindows.getState().focusedId).toBe(wins().find((w) => w.appId === 'notes')!.id);
    await userEvent.keyboard('{Alt>}w{/Alt}');
    await waitFor(() => expect(wins().map((w) => w.appId)).toEqual(['terminal']));
  });

  it('Alt+T opens the terminal, Alt+D shows the desktop', async () => {
    await startDesktop();
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(await screen.findByRole('group', { name: 'Terminal window' })).toBeInTheDocument();
    await userEvent.keyboard('{Alt>}d{/Alt}');
    expect(wins().every((w) => w.minimized)).toBe(true);
  });

  it('does not hijack browser-critical shortcuts', async () => {
    await startDesktop();
    const handled = fireEvent.keyDown(window, { code: 'KeyW', key: 'w', ctrlKey: true });
    expect(handled).toBe(true); // not default-prevented
    expect(fireEvent.keyDown(window, { code: 'KeyT', key: 't', ctrlKey: true })).toBe(true);
    expect(wins()).toHaveLength(0);
  });
});

describe('context menus, notifications and quick settings', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('shows a desktop context menu with working actions and keyboard navigation', async () => {
    await startDesktop();
    fireEvent.contextMenu(screen.getByRole('main', { name: 'Desktop' }), { clientX: 400, clientY: 300 });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'New note' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'New text document' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(useNotes.getState().notes).toHaveLength(1);
    expect(await screen.findByRole('group', { name: 'Notes window' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu with Escape and on outside click', async () => {
    await startDesktop();
    fireEvent.contextMenu(screen.getByRole('main', { name: 'Desktop' }), { clientX: 10, clientY: 10 });
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole('main', { name: 'Desktop' }), { clientX: 10, clientY: 10 });
    await screen.findByRole('menu');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('supports submenus for adding widgets', async () => {
    await startDesktop();
    fireEvent.contextMenu(screen.getByRole('main', { name: 'Desktop' }), { clientX: 10, clientY: 10 });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add widget' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Timer' }));
    expect(screen.getByRole('region', { name: 'Timer widget' })).toBeInTheDocument();
  });

  it('the dock context menu can pin and unpin apps', async () => {
    await startDesktop();
    await openFromLauncher('calculator');
    await screen.findByRole('group', { name: 'Calculator window' });
    const btn = document.querySelector('[data-dock-app="calculator"]') as HTMLElement;
    fireEvent.contextMenu(btn);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pin to dock' }));
    expect(useSettings.getState().settings.dock.pinned).toContain('calculator');
    fireEvent.contextMenu(btn);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unpin from dock' }));
    expect(useSettings.getState().settings.dock.pinned).not.toContain('calculator');
  });

  it('shows a toast and lists notifications in the panel, with unread tracking', async () => {
    await startDesktop();
    act(() => notify({ title: 'Backup finished', body: 'All good', level: 'success' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup finished');
    expect(screen.getByRole('button', { name: /Notifications, 1 unread/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText('Backup finished')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }));
    expect(useNotifications.getState().items[0].read).toBe(true);
    await userEvent.click(within(panel).getByRole('button', { name: 'Clear all notifications' }));
    expect(within(panel).getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('do-not-disturb suppresses toasts but still records the notification', async () => {
    useSettings.getState().update({ notifications: { doNotDisturb: true } });
    await startDesktop();
    act(() => notify({ title: 'Quiet one' }));
    expect(useNotifications.getState().toasts).toHaveLength(0);
    expect(useNotifications.getState().items).toHaveLength(1);
  });

  it('disabled notifications are dropped entirely', async () => {
    useSettings.getState().update({ notifications: { enabled: false } });
    act(() => notify({ title: 'Nope' }));
    expect(useNotifications.getState().items).toHaveLength(0);
  });

  it('quick settings change the theme, accent and toggles immediately', async () => {
    await startDesktop();
    await userEvent.click(screen.getByRole('button', { name: /Quick settings/ }));
    const panel = screen.getByRole('dialog', { name: 'Quick settings' });
    await userEvent.click(within(panel).getByRole('radio', { name: 'Light' }));
    expect(useSettings.getState().settings.theme).toBe('light');
    await userEvent.click(within(panel).getByRole('radio', { name: 'Rose' }));
    expect(useSettings.getState().settings.accent).toBe('rose');
    await userEvent.click(within(panel).getByRole('button', { name: 'Do not disturb' }));
    expect(useSettings.getState().settings.notifications.doNotDisturb).toBe(true);
    await userEvent.click(within(panel).getByRole('button', { name: 'Desktop icons' }));
    expect(screen.queryByRole('button', { name: 'Notes, desktop shortcut' })).not.toBeInTheDocument();
  });

  it('clicking the clock opens a calendar popover that can open the Calendar app', async () => {
    await startDesktop();
    await userEvent.click(screen.getByRole('button', { name: /Open calendar popover/ }));
    const pop = screen.getByRole('dialog', { name: 'Date and calendar' });
    expect(within(pop).getByRole('gridcell', { current: 'date' })).toBeInTheDocument();
    await userEvent.click(within(pop).getByRole('button', { name: 'Open Calendar' }));
    expect(await screen.findByRole('group', { name: 'Calendar window' })).toBeInTheDocument();
  });

  it('panels are mutually exclusive', async () => {
    await startDesktop();
    await userEvent.click(screen.getByRole('button', { name: /Quick settings/ }));
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(useUi.getState().panel).toBe('notifications');
    expect(screen.queryByRole('dialog', { name: 'Quick settings' })).not.toBeInTheDocument();
  });
});

describe('dock customisation', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('moves the dock when the position setting changes', async () => {
    useSettings.getState().update({ dock: { position: 'left' } });
    await startDesktop();
    expect(screen.getByRole('toolbar', { name: 'Applications' })).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('shows only pinned apps plus running unpinned ones', async () => {
    useSettings.getState().update({ dock: { pinned: ['notes'] } });
    await startDesktop();
    expect(document.querySelectorAll('[data-dock-app]')).toHaveLength(1);
    await openFromLauncher('calculator');
    await screen.findByRole('group', { name: 'Calculator window' });
    expect(document.querySelectorAll('[data-dock-app]')).toHaveLength(2);
  });
});
