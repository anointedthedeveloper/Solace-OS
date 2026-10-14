import { lazy } from 'react';
import { FolderOpen } from 'lucide-react';
import type { AppDef } from '../types';

export const filesApp: AppDef = {
  id: 'files',
  name: 'Files',
  description: 'Browse, organise and import files',
  icon: FolderOpen,
  category: 'Utilities',
  keywords: ['folder','explorer','documents','trash','upload'],
  defaultSize: { w: 860, h: 560 },
  minSize: { w: 520, h: 360 },
  desktopShortcut: true,
  component: lazy(() => import('./FileManager')),
};
