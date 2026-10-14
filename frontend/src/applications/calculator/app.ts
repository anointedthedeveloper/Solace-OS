import { lazy } from 'react';
import { Calculator } from 'lucide-react';
import type { AppDef } from '../types';

export const calculatorApp: AppDef = {
  id: 'calculator',
  name: 'Calculator',
  description: 'Arithmetic with history',
  icon: Calculator,
  category: 'Utilities',
  keywords: ['math','calc','numbers'],
  defaultSize: { w: 320, h: 470 },
  minSize: { w: 280, h: 420 },
  singleton: true,
  maximizable: false,
  component: lazy(() => import('./Calculator')),
};
