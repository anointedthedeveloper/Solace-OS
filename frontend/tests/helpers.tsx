import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { DialogHost } from '@/desktop/DialogHost';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi } from '@/stores/uiStore';
import { useNotes } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents } from '@/stores/eventsStore';
import { useDocs } from '@/stores/docsStore';
import { useWidgets } from '@/stores/widgetStore';
import { useDesktop } from '@/stores/desktopStore';
import { useNotifications } from '@/stores/notificationStore';
import { useLauncher } from '@/stores/launcherStore';
import { useFs } from '@/services/fsStore';
import { useFileClipboard } from '@/applications/file-manager/clipboard';
import { flushPersistence } from '@/services/zustandIdb';

/** Reset every store to its initial state so tests are independent. */
export async function resetAll(): Promise<void> {
  await flushPersistence();
  useSettings.setState(useSettings.getInitialState(), true);
  useWindows.setState({ ...useWindows.getInitialState(), windows: {}, order: [], focusedId: null }, true);
  useUi.setState(useUi.getInitialState(), true);
  useNotes.setState(useNotes.getInitialState(), true);
  useTasks.setState(useTasks.getInitialState(), true);
  useEvents.setState(useEvents.getInitialState(), true);
  useDocs.setState(useDocs.getInitialState(), true);
  useWidgets.setState(useWidgets.getInitialState(), true);
  useDesktop.setState(useDesktop.getInitialState(), true);
  useNotifications.setState(useNotifications.getInitialState(), true);
  useLauncher.setState(useLauncher.getInitialState(), true);
  useFileClipboard.getState().clear();
  await useFs.getState().reset();
}

/** Render an app together with the shell's dialog host so confirm/prompt dialogs work. */
export function renderWithDialogs(ui: ReactElement) {
  return render(
    <>
      {ui}
      <DialogHost />
    </>,
  );
}

export const appProps = { windowId: 'test-window', props: {} as Record<string, unknown> };
