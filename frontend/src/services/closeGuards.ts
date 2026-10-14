import { useWindows } from '@/stores/windowStore';

type Guard = () => boolean | Promise<boolean>;
const guards = new Map<string, Guard>();

/** An app can veto closing its window (e.g. unsaved changes). Returns an unregister fn. */
export function registerCloseGuard(windowId: string, guard: Guard): () => void {
  guards.set(windowId, guard);
  return () => {
    if (guards.get(windowId) === guard) guards.delete(windowId);
  };
}

/** Close a window, giving its app a chance to confirm first. Resolves true if closed. */
export async function requestClose(windowId: string): Promise<boolean> {
  const guard = guards.get(windowId);
  if (guard) {
    let ok = false;
    try {
      ok = await guard();
    } catch {
      ok = false;
    }
    if (!ok) return false;
  }
  guards.delete(windowId);
  useWindows.getState().close(windowId);
  return true;
}

export async function requestCloseAll(): Promise<void> {
  for (const id of Object.keys(useWindows.getState().windows)) {
    if (!(await requestClose(id))) return;
  }
}
