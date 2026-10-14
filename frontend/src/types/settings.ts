export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentId = 'lavender' | 'blue' | 'teal' | 'green' | 'amber' | 'rose' | 'silver';
export type WallpaperFit = 'cover' | 'contain' | 'stretch' | 'center' | 'tile';
export type DockPosition = 'bottom' | 'left' | 'right';
export type DockStyle = 'floating' | 'bar';
export type DockSize = 'small' | 'medium' | 'large';
export type IconSize = 'small' | 'medium' | 'large';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type CornerStyle = 'sharp' | 'soft' | 'round';
export type BorderStyle = 'none' | 'subtle' | 'strong';
export type MotionPref = 'auto' | 'reduced' | 'full';

export type ShortcutId =
  | 'launcher'
  | 'closeWindow'
  | 'minimizeWindow'
  | 'maximizeWindow'
  | 'nextWindow'
  | 'prevWindow'
  | 'showDesktop'
  | 'notifications'
  | 'quickSettings'
  | 'openTerminal';

export interface Settings {
  setupComplete: boolean;
  displayName: string;
  theme: ThemeMode;
  accent: AccentId;
  wallpaper: string;
  wallpaperFit: WallpaperFit;
  desktopIcons: { visible: boolean; size: IconSize; labels: boolean };
  dock: { position: DockPosition; style: DockStyle; size: DockSize; pinned: string[]; showLabels: boolean };
  windows: { corners: CornerStyle; border: BorderStyle; restoreOnStartup: boolean; snapToEdges: boolean };
  density: Density;
  motion: MotionPref;
  widgetsVisible: boolean;
  notifications: { enabled: boolean; doNotDisturb: boolean };
  clock: { hour12: boolean; showSeconds: boolean };
  privacy: { rememberRecents: boolean };
  editor: { autosave: boolean };
  shortcuts: Record<ShortcutId, string>;
}
