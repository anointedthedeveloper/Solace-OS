import { filesApp } from './file-manager/app';
import { editorApp } from './text-editor/app';
import { calculatorApp } from './calculator/app';
import { terminalApp } from './terminal/app';
import { settingsApp } from './settings/app';
import { notesApp } from './notes/app';
import { calendarApp } from './calendar/app';
import { tasksApp } from './task-manager/app';
import { browserApp } from './browser/app';
import type { AppDef } from './types';

export const APPS: AppDef[] = [filesApp, browserApp, notesApp, editorApp, tasksApp, calendarApp, calculatorApp, terminalApp, settingsApp];

const byId = new Map(APPS.map((a) => [a.id, a]));

export function getApp(id: string): AppDef | undefined {
  return byId.get(id);
}

/** Resolve a user-typed name or id ("files", "text editor") to an app. */
export function findApp(query: string): AppDef | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return APPS.find((a) => a.id === q || a.name.toLowerCase() === q) ?? APPS.find((a) => a.name.toLowerCase().startsWith(q) || a.id.startsWith(q));
}
