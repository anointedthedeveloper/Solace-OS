import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

export type AppCategory = 'Productivity' | 'Utilities' | 'System' | 'Internet';

export interface AppComponentProps {
  windowId: string;
  /** Launch parameters from `openApp(appId, { props })`. */
  props: Record<string, unknown>;
}

/** Everything the shell needs to know about an application. Each app declares its own. */
export interface AppDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: AppCategory;
  keywords: string[];
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Only one window at a time; opening again focuses the existing one. */
  singleton?: boolean;
  resizable?: boolean;
  maximizable?: boolean;
  /** Show a shortcut on the desktop by default. */
  desktopShortcut?: boolean;
  component: LazyExoticComponent<ComponentType<AppComponentProps>>;
}
