import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Desktop } from '@/desktop/Desktop';
import { Welcome } from '@/desktop/Welcome';
import { useApplySettings } from '@/hooks/useApplySettings';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useNotes } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents } from '@/stores/eventsStore';
import { useDocs } from '@/stores/docsStore';
import { whenHydrated } from '@/services/zustandIdb';
import { notify } from '@/stores/notificationStore';
import { idbAvailable } from '@/services/idb';
import { useAccount } from '@/stores/accountStore';
import { wireAccountSync } from '@/services/sync/wire';

function useBoot(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([whenHydrated(useNotes), whenHydrated(useTasks), whenHydrated(useEvents), whenHydrated(useDocs)]).then(() => {
      if (!alive) return;
      if (!useSettings.getState().settings.windows.restoreOnStartup) useWindows.getState().closeAll();
      setReady(true);
      wireAccountSync();
      // Is there a Solace backend, and is someone signed in? Fails quietly into guest mode.
      void useAccount.getState().checkSession();
      if (!idbAvailable()) {
        notify({ title: 'Storage is limited', body: "This browser blocked IndexedDB, so notes, tasks and documents won't survive a refresh.", level: 'warning' });
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

export function App() {
  useApplySettings();
  const ready = useBoot();
  const setupComplete = useSettings((s) => s.settings.setupComplete);

  if (!ready) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-bg text-ink" role="status" aria-label="Starting Solace OS">
        <Logo size={56} />
      </div>
    );
  }
  return <ErrorBoundary label="Solace OS">{setupComplete ? <Desktop /> : <Welcome />}</ErrorBoundary>;
}
