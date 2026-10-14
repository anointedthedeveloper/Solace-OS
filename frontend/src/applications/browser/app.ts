import { lazy } from 'react';
import { Globe } from 'lucide-react';
import type { AppDef } from '../types';

export const browserApp: AppDef = {
  id: 'browser',
  name: 'Web',
  description: 'Open websites you choose in a new tab',
  icon: Globe,
  category: 'Internet',
  keywords: ['internet','links','bookmarks','url','start page'],
  defaultSize: { w: 760, h: 520 },
  minSize: { w: 480, h: 340 },
  singleton: true,
  component: lazy(() => import('./Browser')),
};
