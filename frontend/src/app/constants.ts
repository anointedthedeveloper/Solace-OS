import type { AccentId, DockSize, IconSize, Settings, ShortcutId, CornerStyle, Density } from '@/types/settings';

export const OS_NAME = 'Solace OS';
export const OS_TAGLINE = 'Everything in its place.';
export const OS_VERSION = '0.1.0';
export const OS_CODENAME = 'Eclipse';

/** Accent presets: a tuned value per theme so contrast holds in both. */
export const ACCENTS: Record<AccentId, { label: string; dark: string; light: string }> = {
  lavender: { label: 'Lavender', dark: '#9d9bf5', light: '#5a53d4' },
  blue: { label: 'Blue', dark: '#6ea8fe', light: '#1f5fd1' },
  teal: { label: 'Teal', dark: '#5cc8c0', light: '#0d6d66' },
  green: { label: 'Green', dark: '#7bc98a', light: '#2a7339' },
  amber: { label: 'Amber', dark: '#e5b567', light: '#8f5504' },
  rose: { label: 'Rose', dark: '#e58fa8', light: '#b0305b' },
  silver: { label: 'Silver', dark: '#b8bfce', light: '#454e5e' },
};

export const CORNER_PX: Record<CornerStyle, number> = { sharp: 4, soft: 10, round: 16 };
export const DENSITY_SCALE: Record<Density, number> = { compact: 0.88, comfortable: 1, spacious: 1.14 };
export const ICON_PX: Record<IconSize, number> = { small: 52, medium: 64, large: 80 };
export const DOCK_PX: Record<DockSize, number> = { small: 38, medium: 44, large: 52 };

export interface ShortcutMeta {
  id: ShortcutId;
  label: string;
  description: string;
}
export const SHORTCUTS: ShortcutMeta[] = [
  { id: 'launcher', label: 'Open launcher', description: 'Search and start applications' },
  { id: 'closeWindow', label: 'Close window', description: 'Close the focused window' },
  { id: 'minimizeWindow', label: 'Minimize window', description: 'Minimize the focused window' },
  { id: 'maximizeWindow', label: 'Maximize / restore', description: 'Toggle maximize on the focused window' },
  { id: 'nextWindow', label: 'Next window', description: 'Focus the next open window' },
  { id: 'prevWindow', label: 'Previous window', description: 'Focus the previous open window' },
  { id: 'showDesktop', label: 'Show desktop', description: 'Minimize or restore all windows' },
  { id: 'notifications', label: 'Notifications', description: 'Toggle the notifications panel' },
  { id: 'quickSettings', label: 'Quick settings', description: 'Toggle the quick-settings panel' },
  { id: 'openTerminal', label: 'Open terminal', description: 'Start the Solace Terminal' },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = {
  launcher: 'Alt+Space',
  closeWindow: 'Alt+KeyW',
  minimizeWindow: 'Alt+KeyM',
  maximizeWindow: 'Alt+Enter',
  nextWindow: 'Alt+Period',
  prevWindow: 'Alt+Comma',
  showDesktop: 'Alt+KeyD',
  notifications: 'Alt+KeyN',
  quickSettings: 'Alt+KeyQ',
  openTerminal: 'Alt+KeyT',
};

export const DEFAULT_SETTINGS: Settings = {
  setupComplete: false,
  displayName: '',
  theme: 'dark',
  accent: 'lavender',
  wallpaper: 'auto',
  wallpaperFit: 'cover',
  desktopIcons: { visible: true, size: 'medium', labels: true },
  dock: {
    position: 'bottom',
    style: 'floating',
    size: 'medium',
    pinned: ['files', 'browser', 'notes', 'editor', 'calendar', 'terminal', 'settings'],
    showLabels: false,
  },
  windows: { corners: 'soft', border: 'subtle', restoreOnStartup: true, snapToEdges: true },
  density: 'comfortable',
  motion: 'auto',
  widgetsVisible: true,
  notifications: { enabled: true, doNotDisturb: false },
  clock: { hour12: false, showSeconds: false },
  privacy: { rememberRecents: true },
  editor: { autosave: true },
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

export interface WallpaperDef {
  id: string;
  label: string;
  tone: 'dark' | 'light';
}
export const WALLPAPERS: WallpaperDef[] = [
  { id: 'eclipse', label: 'Eclipse', tone: 'dark' },
  { id: 'graphite', label: 'Graphite', tone: 'dark' },
  { id: 'dusk', label: 'Dusk', tone: 'dark' },
  { id: 'slate', label: 'Slate', tone: 'dark' },
  { id: 'mist', label: 'Mist', tone: 'light' },
  { id: 'paper', label: 'Paper', tone: 'light' },
  { id: 'dawn', label: 'Dawn', tone: 'light' },
];
