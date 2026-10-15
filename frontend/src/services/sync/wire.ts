import { useAccount } from '@/stores/accountStore';
import { useSettings } from '@/stores/settingsStore';
import { notify } from '@/stores/notificationStore';
import { syncEngine } from './engine';

let wired = false;

/** Start syncing when someone signs in, stop when they sign out. Idempotent. */
export function wireAccountSync(): void {
  if (wired) return;
  wired = true;
  const begin = (id: string) =>
    syncEngine.start(id, () => {
      notify({ title: 'Signed out', body: 'Your session ended. Sign in again to keep syncing.', level: 'warning', appId: 'settings' });
      useAccount.setState({ status: 'guest', user: null });
    });
  const current = useAccount.getState();
  if (current.status === 'signed-in' && current.user) begin(current.user.id);

  useAccount.subscribe((s, p) => {
    if (s.status === 'signed-in' && s.user && (p.status !== 'signed-in' || p.user?.id !== s.user.id)) {
      if (s.user.displayName) useSettings.getState().update({ displayName: s.user.displayName });
      begin(s.user.id);
    } else if (s.status !== 'signed-in' && p.status === 'signed-in') {
      syncEngine.stop();
    }
  });
}
