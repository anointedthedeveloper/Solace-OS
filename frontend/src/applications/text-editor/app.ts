import { lazy } from 'react';
import { FileText } from 'lucide-react';
import type { AppDef } from '../types';

export const editorApp: AppDef = {
  id: 'editor',
  name: 'Text Editor',
  description: 'Write and edit plain-text documents',
  icon: FileText,
  category: 'Productivity',
  keywords: ['text','write','document','txt','code'],
  defaultSize: { w: 820, h: 560 },
  minSize: { w: 480, h: 320 },
  desktopShortcut: true,
  component: lazy(() => import('./TextEditor')),
};
