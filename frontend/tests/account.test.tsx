import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '@/applications/settings/Settings';
import FileManager from '@/applications/file-manager/FileManager';
import { useAccount } from '@/stores/accountStore';
import { useSettings } from '@/stores/settingsStore';
import { useNotes } from '@/stores/notesStore';
import { useNotifications } from '@/stores/notificationStore';
import { syncEngine } from '@/services/sync/engine';
import { wireAccountSync } from '@/services/sync/wire';
import { FakeServer } from './fakeServer';
import { appProps, renderWithDialogs, resetAll } from './helpers';

let server: FakeServer;

const open = () => renderWithDialogs(<Settings {...appProps} props={{ section: 'account' }} />);

describe('Account (backend) settings', () => {
  beforeEach(async () => {
    await resetAll();
    localStorage.clear();
    server = new FakeServer().install();
    useAccount.setState({ status: 'checking', user: null });
    wireAccountSync();
  });
  afterEach(() => {
    syncEngine.stop();
    vi.unstubAllGlobals();
  });

  it('explains guest mode when no Solace server exists, and can re-check', async () => {
    server.down = true;
    await useAccount.getState().checkSession();
    open();
    expect(screen.getByText(/No Solace server is available/)).toBeInTheDocument();
    expect(screen.getByText(/guest mode/i)).toBeInTheDocument();
    server.down = false;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('form', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a sign-in form when a backend is present but nobody is signed in', async () => {
    await useAccount.getState().checkSession();
    open();
    expect(screen.getByRole('form', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/notes, tasks, calendar events and appearance settings/i)).toBeInTheDocument();
    expect(screen.getByText(/never stored in your browser/i)).toBeInTheDocument();
  });

  it('registers an account, signs in, starts syncing and never stores the password locally', async () => {
    useNotes.getState().create({ title: 'Local before signing up' });
    await useAccount.getState().checkSession();
    open();
    await userEvent.click(screen.getByRole('radio', { name: 'Create account' }));
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.type(screen.getByRole('textbox', { name: /Display name.*optional/ }), 'Ada L');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(useAccount.getState()).toMatchObject({ status: 'signed-in', user: { username: 'ada', displayName: 'Ada L' } });
    await waitFor(() => expect(server.records.notes.size).toBe(1)); // existing local data was uploaded
    expect(useSettings.getState().settings.displayName).toBe('Ada L');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('correct horse battery');
    expect(JSON.stringify(sessionStorage)).not.toContain('correct horse battery');
  });

  it('shows field-level validation errors from the server', async () => {
    await useAccount.getState().checkSession();
    open();
    await userEvent.click(screen.getByRole('radio', { name: 'Create account' }));
    await userEvent.type(screen.getByLabelText('Username'), 'ab');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/3–32 characters/);
    expect(useAccount.getState().status).toBe('guest');
  });

  it('reports bad credentials without saying which part was wrong, and handles rate limiting', async () => {
    server.users.set('u1', { id: 'u1', username: 'ada', password: 'right password', displayName: 'Ada' });
    await useAccount.getState().checkSession();
    open();
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
    server.failNext = { status: 429, message: 'Too many attempts', retryAfter: 600 };
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Too many attempts.*10 minute/));
  });

  it('shows the signed-in view with sync status, lets you rename yourself, and sync on demand', async () => {
    server.users.set('u1', { id: 'u1', username: 'ada', password: 'pw', displayName: 'Ada' });
    server.signedIn = 'u1';
    await useAccount.getState().checkSession();
    open();
    expect(screen.getByText('ada')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Up to date/)).toBeInTheDocument());
    const name = screen.getByLabelText('Display name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Ada Lovelace');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(server.users.get('u1')!.displayName).toBe('Ada Lovelace'));
    server.calls.length = 0;
    await userEvent.click(screen.getByRole('button', { name: /Sync now/ }));
    await waitFor(() => expect(server.calls.some((c) => c.path === '/notes')).toBe(true));
  });

  it('signing out can keep or remove the local copy, and stops sync', async () => {
    server.users.set('u1', { id: 'u1', username: 'ada', password: 'pw', displayName: 'Ada' });
    server.signedIn = 'u1';
    await useAccount.getState().checkSession();
    useNotes.getState().create({ title: 'mine' });
    open();
    await userEvent.click(screen.getByRole('button', { name: /Sign out…/ }));
    let dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(useAccount.getState().status).toBe('signed-in');

    await userEvent.click(screen.getByRole('button', { name: /Sign out…/ }));
    dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Sign out and remove data' }));
    await waitFor(() => expect(useAccount.getState().status).toBe('guest'));
    expect(useNotes.getState().notes).toHaveLength(0); // wiped from this device…
    expect(server.records.notes.size).toBe(1); // …but safe on the server
    expect(server.signedIn).toBeNull();
  });

  it('deleting the account needs the password (masked) and removes it server-side', async () => {
    server.users.set('u1', { id: 'u1', username: 'ada', password: 'secret-pass-1', displayName: 'Ada' });
    server.signedIn = 'u1';
    await useAccount.getState().checkSession();
    open();
    await userEvent.click(screen.getByRole('button', { name: /Delete account…/ }));
    const dlg = await screen.findByRole('dialog');
    const field = within(dlg).getByLabelText(/Enter your password/);
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, 'nope{Enter}');
    await waitFor(() => expect(useNotifications.getState().items.some((n) => n.title === 'Could not delete account')).toBe(true));
    expect(server.users.size).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /Delete account…/ }));
    const dlg2 = await screen.findByRole('dialog');
    await userEvent.type(within(dlg2).getByLabelText(/Enter your password/), 'secret-pass-1{Enter}');
    await waitFor(() => expect(server.users.size).toBe(0));
    expect(useAccount.getState().status).toBe('guest');
  });
});

describe('Cloud files (server-managed)', () => {
  beforeEach(async () => {
    await resetAll();
    localStorage.clear();
    server = new FakeServer().install();
    server.users.set('u1', { id: 'u1', username: 'ada', password: 'pw', displayName: 'Ada' });
    server.signedIn = 'u1';
    useAccount.setState({ status: 'signed-in', user: { id: 'u1', username: 'ada', displayName: 'Ada' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  const goCloud = async () => {
    renderWithDialogs(<FileManager {...appProps} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cloud files' }));
    return screen.findByLabelText('Cloud files');
  };

  it('is only offered when signed in, with an honest explanation', async () => {
    useAccount.setState({ status: 'guest', user: null });
    renderWithDialogs(<FileManager {...appProps} />);
    await screen.findByRole('navigation', { name: 'Locations' });
    expect(screen.queryByRole('button', { name: 'Cloud files' })).not.toBeInTheDocument();
  });

  it('shows an empty state, then creates a folder and uploads a file that really reach the server', async () => {
    const pane = await goCloud();
    expect(await within(pane).findByText('This folder is empty')).toBeInTheDocument();
    expect(screen.getByText(/stored on your Solace server and only your account can access them/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /new folder/i }));
    await userEvent.type(within(await screen.findByRole('dialog')).getByLabelText('Folder name'), '{Control>}a{/Control}Reports{Enter}');
    await waitFor(() => expect([...server.files.values()].some((f) => f.name === 'Reports' && f.kind === 'folder')).toBe(true));
    await userEvent.upload(screen.getByLabelText('Choose files to upload to the cloud'), new File(['hello cloud'], 'hello.txt', { type: 'text/plain' }));
    await waitFor(() => expect([...server.files.values()].some((f) => f.name === 'hello.txt')).toBe(true));
    expect(await screen.findByRole('option', { name: /hello\.txt/ })).toBeInTheDocument();
    expect(screen.getByText(/11 B of 1000 B used/)).toBeInTheDocument();
  });

  it('surfaces server-side rejections (type, size, quota) as notifications', async () => {
    await goCloud();
    await userEvent.upload(screen.getByLabelText('Choose files to upload to the cloud'), new File(['x'], 'bad.exe'));
    await waitFor(() => expect(useNotifications.getState().items.some((n) => n.body === 'That file type is not supported')).toBe(true));
    await userEvent.upload(screen.getByLabelText('Choose files to upload to the cloud'), new File(['x'.repeat(401)], 'big.txt'));
    await waitFor(() => expect(useNotifications.getState().items.some((n) => /at most 400 bytes/.test(n.body ?? ''))).toBe(true));
    expect(server.files.size).toBe(0);
  });

  it('renames, trashes, restores and permanently deletes (with confirmation)', async () => {
    server.files.set('f1', { id: 'f1', name: 'a.txt', kind: 'file', mimeType: 'text/plain', size: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), text: 'abc' });
    await goCloud();
    await userEvent.click(await screen.findByRole('option', { name: /a\.txt/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('New name'), '{Control>}a{/Control}b.txt{Enter}');
    await waitFor(() => expect(server.files.get('f1')!.name).toBe('b.txt'));

    await userEvent.click(await screen.findByRole('option', { name: /b\.txt/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    await waitFor(() => expect(server.files.get('f1')!.trashedAt).toBeTruthy());
    await userEvent.click(within(screen.getByLabelText('Cloud files').parentElement!).getByRole('button', { name: /^Trash$/ }));
    await userEvent.click(await screen.findByRole('option', { name: /b\.txt/ }));
    await userEvent.click(screen.getByRole('button', { name: /Restore/ }));
    await waitFor(() => expect(server.files.get('f1')!.trashedAt).toBeUndefined());

    await userEvent.click(screen.getByRole('button', { name: /Back to files/ }));
    expect(await screen.findByRole('option', { name: /b\.txt/ })).toBeInTheDocument(); // restored
  });

  it('permanent deletion asks first', async () => {
    server.files.set('f1', { id: 'f1', name: 'old.txt', kind: 'file', mimeType: 'text/plain', size: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), trashedAt: new Date().toISOString(), text: 'x' });
    await goCloud();
    await userEvent.click(within(screen.getByLabelText('Cloud files').parentElement!).getByRole('button', { name: /^Trash$/ }));
    await userEvent.click(await screen.findByRole('option', { name: /old\.txt/ }));
    await userEvent.click(screen.getByRole('button', { name: /Delete permanently/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(server.files.has('f1')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /Delete permanently/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(server.files.has('f1')).toBe(false));
  });

  it('shows a clear error with retry when the server is unreachable', async () => {
    server.down = true;
    renderWithDialogs(<FileManager {...appProps} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cloud files' }));
    expect(await screen.findByText('Can’t load cloud files')).toBeInTheDocument();
    expect(screen.getByText('The Solace server can’t be reached.')).toBeInTheDocument();
    server.down = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
  });

  it('opens a text file from the cloud in the editor', async () => {
    server.files.set('f1', { id: 'f1', name: 'note.txt', kind: 'file', mimeType: 'text/plain', size: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), text: 'hello' });
    await goCloud();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.doubleClick(await screen.findByRole('option', { name: /note\.txt/ }));
    const { useDocs } = await import('@/stores/docsStore');
    await waitFor(() => expect(useDocs.getState().docs[0]).toMatchObject({ name: 'note.txt', content: 'hello' }));
  });
});
