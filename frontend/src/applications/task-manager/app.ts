import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import type { AppDef } from '../types';

export const tasksApp: AppDef = {
  id: 'tasks',
  name: 'Tasks',
  description: 'Track what needs doing',
  icon: ListChecks,
  category: 'Productivity',
  keywords: ['todo','checklist','reminders','due'],
  defaultSize: { w: 720, h: 540 },
  minSize: { w: 480, h: 340 },
  singleton: true,
  component: lazy(() => import('./TaskManager')),
};
