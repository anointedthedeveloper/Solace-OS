import { useState } from 'react';
import { Cloud, CloudOff, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { Group, Row } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { useSettings } from '@/stores/settingsStore';
import { useAccount } from '@/stores/accountStore';
import { choiceDialog, promptDialog } from '@/stores/uiStore';
import { notify } from '@/stores/notificationStore';
import { useNotes } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents } from '@/stores/eventsStore';
import { ApiError } from '@/services/api';
import { clearSyncMeta, syncEngine, useSyncStatus } from '@/services/sync/engine';
import { formatRelative } from '@/utils/format';

type Mode = 'signin' | 'register';

function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return `Too many attempts. Please try again in ${Math.ceil((e.retryAfter ?? 60) / 60)} minute(s).`;
    if (e.fieldErrors.length) return e.fieldErrors.map((f) => f.message).join(' ');
    if (e.unreachable) return 'The Solace server can’t be reached right now.';
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}

function SignInForm() {
  const { login, register } = useAccount.getState();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await login({ username, password });
      else await register({ username, password, displayName: displayName.trim() });
      setPassword('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3 py-2" aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}>
      <Segmented<Mode> label="Account action" value={mode} onChange={(m) => { setMode(m); setError(null); }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
      <div>
        <label className="mb-1 block text-[12.5px]" htmlFor="acct-user">Username</label>
        <input id="acct-user" className="s-input w-full" autoComplete="username" value={username} maxLength={32} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px]" htmlFor="acct-pass">Password</label>
        <input id="acct-pass" type="password" className="s-input w-full" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} required />
        {mode === 'register' && <p className="m-0 mt-1 text-[12px] text-faint">10–72 characters. A few random words make a strong password.</p>}
      </div>
      {mode === 'register' && (
        <div>
          <label className="mb-1 block text-[12.5px]" htmlFor="acct-name">Display name <span className="text-faint">(optional)</span></label>
          <input id="acct-name" className="s-input w-full" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
      )}
      <div role="alert" className="min-h-4 text-[12.5px] text-danger">{error}</div>
      <button type="submit" className="s-btn s-btn-primary" disabled={busy || !username || !password}>
        {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      <p className="m-0 text-[12px] leading-snug text-faint">
        Signing in syncs your <strong>notes, tasks, calendar events and appearance settings</strong> with this Solace server and unlocks cloud files. Text documents, bookmarks and widgets stay on this device. Your password is sent over the connection to the server once and is never stored in your browser.
      </p>
    </form>
  );
}

function SyncStatusRow() {
  const { state, lastSyncedAt, error } = useSyncStatus();
  const label = state === 'syncing' ? 'Syncing…' : state === 'offline' ? 'Offline — changes will sync later' : state === 'error' ? 'Sync problem' : lastSyncedAt ? `Up to date · ${formatRelative(lastSyncedAt)}` : 'Waiting to sync';
  return (
    <Row title="Sync" hint={error ? <span className="text-danger" role="alert">{error}</span> : 'Notes, tasks, events and settings follow you across devices.'}>
      <span className="flex items-center gap-1.5 text-[12.5px] text-dim" aria-live="polite">
        {state === 'offline' || state === 'error' ? <CloudOff size={14} aria-hidden /> : <Cloud size={14} aria-hidden />} {label}
      </span>
      <button className="s-btn" disabled={state === 'syncing'} onClick={() => void syncEngine.syncNow(false)}>
        <RefreshCw size={14} /> Sync now
      </button>
    </Row>
  );
}

function SignedIn() {
  const user = useAccount((s) => s.user)!;
  const { updateDisplayName, logout, deleteAccount } = useAccount.getState();
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState<string | null>(null);

  const saveName = async () => {
    try {
      await updateDisplayName(name.trim());
      useSettings.getState().update({ displayName: name.trim() });
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const signOut = async () => {
    const choice = await choiceDialog({
      title: 'Sign out?',
      message: 'Your synced data stays safe on the server. You can keep a copy on this device, or remove it (recommended on a shared computer).',
      confirmLabel: 'Sign out, keep data here',
      altLabel: 'Sign out and remove data',
      cancelLabel: 'Cancel',
    });
    if (choice === 'cancel') return;
    try {
      await syncEngine.syncNow(false); // flush pending changes before leaving
      await logout();
      clearSyncMeta(user.id);
      if (choice === 'alt') {
        useNotes.getState().replaceAll([]);
        useTasks.getState().replaceAll([]);
        useEvents.getState().replaceAll([]);
      }
    } catch (e) {
      notify({ title: 'Could not sign out', body: describeError(e), level: 'error', appId: 'settings' });
    }
  };

  const remove = async () => {
    const password = await promptDialog({ title: 'Delete your account?', label: 'This permanently deletes your account and everything stored on the server. Enter your password to confirm.', confirmLabel: 'Delete account', secret: true, validate: (v) => (v ? null : 'Enter your password.') });
    if (!password) return;
    try {
      await deleteAccount(password);
      clearSyncMeta(user.id);
      notify({ title: 'Account deleted', body: 'Your server data was removed. Data on this device is unchanged.', level: 'success', appId: 'settings' });
    } catch (e) {
      notify({ title: 'Could not delete account', body: describeError(e), level: 'error', appId: 'settings' });
    }
  };

  return (
    <>
      <Group title="Account">
        <Row title={user.username} hint="Signed in on this device"><span className="text-[12.5px] text-success">Signed in</span></Row>
        <Row title="Display name" hint={error ? <span className="text-danger" role="alert">{error}</span> : undefined}>
          <input className="s-input w-44" aria-label="Display name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="s-btn" onClick={() => void saveName()} disabled={name.trim() === user.displayName}>Save</button>
        </Row>
        <SyncStatusRow />
        <Row title="Sign out"><button className="s-btn" onClick={() => void signOut()}><LogOut size={14} /> Sign out…</button></Row>
      </Group>
      <Group title="Danger zone">
        <Row title="Delete account" hint="Removes your account and all server-side data permanently."><button className="s-btn s-btn-danger" onClick={() => void remove()}><Trash2 size={14} /> Delete account…</button></Row>
      </Group>
    </>
  );
}

export function AccountSection() {
  const status = useAccount((s) => s.status);
  const name = useSettings((s) => s.settings.displayName);
  const update = useSettings((s) => s.update);
  const { checkSession } = useAccount.getState();

  return (
    <>
      {status === 'signed-in' ? (
        <SignedIn />
      ) : (
        <Group title="Account">
          {status === 'checking' && <p className="py-3 text-[13px] text-dim" role="status">Checking for a Solace server…</p>}
          {status === 'unavailable' && (
            <div className="py-3 text-[13px] text-dim" role="status">
              <div className="flex items-center gap-2 text-ink"><CloudOff size={15} aria-hidden /> No Solace server is available.</div>
              <p className="m-0 mt-1">Solace is running in <strong>guest mode</strong>: everything is stored in this browser. Accounts, sync and cloud files need a Solace backend (see the README to set one up).</p>
              <button className="s-btn mt-2" onClick={() => void checkSession()}>Check again</button>
            </div>
          )}
          {status === 'guest' && <SignInForm />}
        </Group>
      )}
      {status !== 'signed-in' && (
        <Group title="Profile (guest)">
          <Row title="Display name" hint="Shown in the launcher and used by the terminal. Stored only in this browser.">
            <input className="s-input w-48" aria-label="Display name" maxLength={40} value={name} onChange={(e) => update({ displayName: e.target.value })} />
          </Row>
        </Group>
      )}
    </>
  );
}
