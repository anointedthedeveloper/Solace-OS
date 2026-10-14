import { useEffect } from 'react';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi } from '@/stores/uiStore';
import { comboMatches } from '@/utils/shortcuts';
import { requestClose } from '@/services/closeGuards';
import type { ShortcutId } from '@/types/settings';

export const RECORDING_ATTR = 'data-recording-shortcut';

function run(id: ShortcutId) {
  const w = useWindows.getState();
  const ui = useUi.getState();
  const focused = w.focusedId;
  switch (id) {
    case 'launcher':
      return ui.togglePanel('launcher');
    case 'notifications':
      return ui.togglePanel('notifications');
    case 'quickSettings':
      return ui.togglePanel('quickSettings');
    case 'closeWindow':
      return focused ? void requestClose(focused) : undefined;
    case 'minimizeWindow':
      return focused ? w.minimize(focused) : undefined;
    case 'maximizeWindow':
      return focused ? w.toggleMaximize(focused) : undefined;
    case 'nextWindow':
      return w.cycle(1);
    case 'prevWindow':
      return w.cycle(-1);
    case 'showDesktop':
      return w.toggleShowDesktop();
    case 'openTerminal':
      return void w.openApp('terminal');
  }
}

/** Global, configurable keyboard shortcuts. Matches KeyboardEvent.code so it is layout independent. */
export function useGlobalShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.body.hasAttribute(RECORDING_ATTR)) return;
      if (e.key === 'Escape') {
        const ui = useUi.getState();
        if (ui.menu) ui.closeMenu();
        else if (ui.panel) ui.closePanel();
        return;
      }
      const shortcuts = useSettings.getState().settings.shortcuts;
      for (const [id, combo] of Object.entries(shortcuts)) {
        if (comboMatches(e, combo)) {
          e.preventDefault();
          run(id as ShortcutId);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
