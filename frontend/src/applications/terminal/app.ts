import { lazy } from 'react';
import { SquareTerminal } from 'lucide-react';
import type { AppDef } from '../types';

export const terminalApp: AppDef = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Solace command environment (simulated)',
  icon: SquareTerminal,
  category: 'System',
  keywords: ['shell','console','command','cli'],
  defaultSize: { w: 700, h: 440 },
  minSize: { w: 420, h: 260 },
  component: lazy(() => import('./Terminal')),
};
