import { useSettings, mergeSettings } from '@/stores/settingsStore';
import { useNotes, type Note } from '@/stores/notesStore';
import { useTasks, type Task } from '@/stores/tasksStore';
import { useEvents, type CalendarEvent } from '@/stores/eventsStore';
import { useDocs, type SolaceDoc } from '@/stores/docsStore';
import { useWidgets, type WidgetInstance } from '@/stores/widgetStore';
import { useDesktop, type DesktopIcon } from '@/stores/desktopStore';
import { useBookmarks, type Bookmark } from '@/applications/browser/bookmarksStore';
import { DEFAULT_SETTINGS } from '@/app/constants';
import { OS_VERSION } from '@/app/constants';
import type { Settings } from '@/types/settings';

export const EXPORT_FORMAT = 'solace-os-export';

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  version: 1;
  appVersion: string;
  exportedAt: string;
  data: {
    settings: Settings;
    notes: Note[];
    tasks: Task[];
    events: CalendarEvent[];
    documents: SolaceDoc[];
    widgets: WidgetInstance[];
    desktopIcons: DesktopIcon[];
    bookmarks: Bookmark[];
  };
}

/** Local data only. Solace Files (binary) are exported from the Files app. */
export function buildExport(): ExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    appVersion: OS_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings: useSettings.getState().settings,
      notes: useNotes.getState().notes,
      tasks: useTasks.getState().tasks,
      events: useEvents.getState().events,
      documents: useDocs.getState().docs,
      widgets: useWidgets.getState().widgets,
      desktopIcons: useDesktop.getState().icons,
      bookmarks: useBookmarks.getState().bookmarks,
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 100_000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type ParseResult = { ok: true; bundle: ExportBundle; counts: Record<string, number> } | { ok: false; error: string };

/** Validate and sanitise an import. Unknown fields are dropped; nothing is trusted. */
export function parseImport(text: string): ParseResult {
  if (text.length > 20 * 1024 * 1024) return { ok: false, error: 'That file is too large to import.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isObj(raw) || raw.format !== EXPORT_FORMAT || raw.version !== 1 || !isObj(raw.data)) return { ok: false, error: 'That file is not a Solace OS export.' };
  const d = raw.data;

  const notes: Note[] = arr(d.notes).filter(isObj).map((n) => ({
    id: str(n.id, 64) || crypto.randomUUID(), title: str(n.title, 500), content: str(n.content), createdAt: num(n.createdAt, Date.now()), updatedAt: num(n.updatedAt, Date.now()), pinned: n.pinned === true, archived: n.archived === true,
  }));
  const tasks: Task[] = arr(d.tasks).filter(isObj).filter((t) => str(t.title)).map((t) => ({
    id: str(t.id, 64) || crypto.randomUUID(), title: str(t.title, 200), details: str(t.details, 2000), due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
    priority: t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium', done: t.done === true, createdAt: num(t.createdAt, Date.now()), completedAt: t.completedAt === null ? null : num(t.completedAt, 0) || null,
  }));
  const events: CalendarEvent[] = arr(d.events).filter(isObj).filter((e) => str(e.title) && Number.isFinite(e.start) && Number.isFinite(e.end)).map((e) => ({
    id: str(e.id, 64) || crypto.randomUUID(), title: str(e.title, 200), start: num(e.start), end: Math.max(num(e.start), num(e.end)), allDay: e.allDay === true, location: str(e.location, 200), description: str(e.description, 2000),
  }));
  const documents: SolaceDoc[] = arr(d.documents).filter(isObj).map((x) => ({
    id: str(x.id, 64) || crypto.randomUUID(), name: str(x.name, 120) || 'Untitled.txt', content: str(x.content, 5_000_000), savedContent: str(x.savedContent, 5_000_000), createdAt: num(x.createdAt, Date.now()), updatedAt: num(x.updatedAt, Date.now()), untitled: x.untitled === true,
  }));
  const widgetTypes = ['clock', 'calendar', 'notes', 'tasks', 'timer', 'quicklaunch'];
  const widgets: WidgetInstance[] = arr(d.widgets).filter(isObj).filter((w) => widgetTypes.includes(str(w.type))).map((w) => ({
    id: str(w.id, 64) || crypto.randomUUID(), type: str(w.type) as WidgetInstance['type'], x: num(w.x), y: num(w.y), w: Math.max(100, num(w.w, 220)), h: Math.max(80, num(w.h, 140)), config: isObj(w.config) ? w.config : {},
  }));
  const desktopIcons: DesktopIcon[] = arr(d.desktopIcons).filter(isObj).map((i) => ({ appId: str(i.appId, 40), col: Math.max(0, Math.floor(num(i.col))), row: Math.max(0, Math.floor(num(i.row))) })).filter((i) => i.appId);
  const bookmarks: Bookmark[] = arr(d.bookmarks).filter(isObj).filter((b) => /^https?:\/\//i.test(str(b.url, 2048))).map((b) => ({ id: str(b.id, 64) || crypto.randomUUID(), title: str(b.title, 60) || str(b.url, 60), url: str(b.url, 2048) }));
  const settings = mergeSettings(DEFAULT_SETTINGS, d.settings);

  return {
    ok: true,
    bundle: { format: EXPORT_FORMAT, version: 1, appVersion: str(raw.appVersion, 20), exportedAt: str(raw.exportedAt, 40), data: { settings, notes, tasks, events, documents, widgets, desktopIcons, bookmarks } },
    counts: { Notes: notes.length, Tasks: tasks.length, Events: events.length, Documents: documents.length, Widgets: widgets.length, Bookmarks: bookmarks.length },
  };
}

/** Replace local data with the (already validated) bundle. */
export function applyImport(b: ExportBundle): void {
  const d = b.data;
  useSettings.setState({ settings: d.settings });
  useNotes.getState().replaceAll(d.notes);
  useTasks.getState().replaceAll(d.tasks);
  useEvents.getState().replaceAll(d.events);
  useDocs.setState({ docs: d.documents, openIds: [], activeId: null });
  useWidgets.setState({ widgets: d.widgets });
  useDesktop.setState({ icons: d.desktopIcons });
  useBookmarks.setState({ bookmarks: d.bookmarks });
}

/** Wipe everything Solace stores in this browser, then reload into first-run. */
export async function eraseAllLocalData(): Promise<void> {
  const { idbClear } = await import('./idb');
  const { flushPersistence } = await import('./zustandIdb');
  await flushPersistence();
  for (const s of ['kv', 'fs', 'blobs'] as const) await idbClear(s);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('solace.')) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  window.location.reload();
}
