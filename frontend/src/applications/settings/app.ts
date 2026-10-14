import { lazy } from 'react';
import { Settings } from 'lucide-react';
import type { AppDef } from '../types';

export const settingsApp: AppDef = {
  id: 'settings',
  name: 'Settings',
  description: 'Personalise and configure Solace OS',
  icon: Settings,
  category: 'System',
  keywords: ['preferences','theme','appearance','wallpaper','dock','shortcuts'],
  defaultSize: { w: 880, h: 600 },
  minSize: { w: 600, h: 400 },
  singleton: true,
  desktopShortcut: true,
  component: lazy(() => import('./Settings')),
};
