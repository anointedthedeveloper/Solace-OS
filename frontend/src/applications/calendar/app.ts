import { lazy } from 'react';
import { CalendarDays } from 'lucide-react';
import type { AppDef } from '../types';

export const calendarApp: AppDef = {
  id: 'calendar',
  name: 'Calendar',
  description: 'Plan your days with local events',
  icon: CalendarDays,
  category: 'Productivity',
  keywords: ['events','schedule','agenda','month'],
  defaultSize: { w: 900, h: 600 },
  minSize: { w: 640, h: 420 },
  singleton: true,
  component: lazy(() => import('./Calendar')),
};
