import { lazy } from 'react';
import { StickyNote } from 'lucide-react';
import type { AppDef } from '../types';

export const notesApp: AppDef = {
  id: 'notes',
  name: 'Notes',
  description: 'Quick notes that save as you type',
  icon: StickyNote,
  category: 'Productivity',
  keywords: ['memo','write','jot'],
  defaultSize: { w: 780, h: 540 },
  minSize: { w: 520, h: 340 },
  singleton: true,
  desktopShortcut: true,
  component: lazy(() => import('./Notes')),
};
