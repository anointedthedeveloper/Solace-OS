import { useEffect, useRef } from 'react';
import { ImagePlus, LayoutGrid, Palette, RotateCcw, StickyNote, FileText, Terminal as TermIcon, FolderOpen, Layers, Eye, EyeOff, Settings as SettingsIcon } from 'lucide-react';
import { WindowLayer } from '@/window-manager/WindowLayer';
import { useGlobalShortcuts } from '@/window-manager/useGlobalShortcuts';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useUi, type MenuItem } from '@/stores/uiStore';
import { useWidgets, WIDGET_META, type WidgetType } from '@/stores/widgetStore';
import { useDesktop } from '@/stores/desktopStore';
import { useNotes } from '@/stores/notesStore';
import { useDocs } from '@/stores/docsStore';
import { cn } from '@/utils/cn';
import { Wallpaper } from './Wallpaper';
import { DesktopIcons, cellSize } from './DesktopIcons';
import { WidgetLayer } from './widgets/WidgetLayer';
import { Taskbar } from './Taskbar';
import { Launcher } from './Launcher';
import { NotificationsPanel } from './NotificationsPanel';
import { QuickSettings } from './QuickSettings';
import { ClockPopover } from './ClockPopover';
import { ContextMenuHost } from './ContextMenuHost';
import { DialogHost } from './DialogHost';
import { ToastHost } from './ToastHost';
import { ICON_PX } from '@/app/constants';

function desktopMenu(): MenuItem[] {
  const s = useSettings.getState();
  const st = s.settings;
  const w = useWindows.getState();
  const addWidget = (type: WidgetType) => {
    if (!st.widgetsVisible) s.update({ widgetsVisible: true });
    useWidgets.getState().add(type);
  };
  const rows = Math.max(1, Math.floor((w.workArea.h - 10) / cellSize(ICON_PX[st.desktopIcons.size]).h));
  return [
    { label: 'New note', icon: StickyNote, onSelect: () => { useNotes.getState().create(); w.openApp('notes'); } },
    { label: 'New text document', icon: FileText, onSelect: () => { useDocs.getState().create(); w.openApp('editor'); } },
    { separator: true },
    { label: 'Open Files', icon: FolderOpen, onSelect: () => w.openApp('files') },
    { label: 'Open Terminal', icon: TermIcon, onSelect: () => w.openApp('terminal') },
    { separator: true },
    {
      label: 'Add widget',
      icon: Layers,
      children: (Object.keys(WIDGET_META) as WidgetType[]).map((t) => ({ label: WIDGET_META[t].label, onSelect: () => addWidget(t) })),
    },
    { label: st.widgetsVisible ? 'Hide widgets' : 'Show widgets', icon: st.widgetsVisible ? EyeOff : Eye, onSelect: () => s.update({ widgetsVisible: !st.widgetsVisible }) },
    { separator: true },
    { label: st.desktopIcons.visible ? 'Hide desktop icons' : 'Show desktop icons', icon: LayoutGrid, onSelect: () => s.update({ desktopIcons: { visible: !st.desktopIcons.visible } }) },
    { label: 'Reset icon layout', icon: RotateCcw, onSelect: () => useDesktop.getState().reset(rows) },
    { separator: true },
    { label: 'Change wallpaper', icon: ImagePlus, onSelect: () => w.openApp('settings', { props: { section: 'wallpapers', at: Date.now() } }) },
    { label: 'Personalise', icon: Palette, onSelect: () => w.openApp('settings', { props: { section: 'appearance', at: Date.now() } }) },
    { label: 'Settings', icon: SettingsIcon, onSelect: () => w.openApp('settings') },
  ];
}

export function Desktop() {
  const position = useSettings((s) => s.settings.dock.position);
  const panel = useUi((s) => s.panel);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const setWorkArea = useWindows((s) => s.setWorkArea);

  useGlobalShortcuts(true);

  // Track the usable workspace (everything except the dock) and keep windows reachable.
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const measure = () => {
      // Ignore un-laid-out measurements (hidden tab / zero-size) so windows aren't squashed.
      if (el.clientWidth > 0 && el.clientHeight > 0) setWorkArea({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setWorkArea, position]);

  return (
    <div className={cn('fixed inset-0 flex overflow-hidden bg-bg', position === 'bottom' ? 'flex-col' : position === 'left' ? 'flex-row-reverse' : 'flex-row')} data-testid="desktop">
      <Wallpaper />
      <main
        ref={workspaceRef}
        aria-label="Desktop"
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        onContextMenu={(e) => {
          e.preventDefault();
          useUi.getState().openMenu(e.clientX, e.clientY, desktopMenu());
        }}
        onPointerDown={() => {
          const ui = useUi.getState();
          if (ui.panel) ui.closePanel();
        }}
      >
        <DesktopIcons />
        <WidgetLayer />
        <WindowLayer />
      </main>
      <Taskbar />
      {panel === 'launcher' && <Launcher />}
      {panel === 'notifications' && <NotificationsPanel />}
      {panel === 'quickSettings' && <QuickSettings />}
      {panel === 'clock' && <ClockPopover />}
      <ToastHost />
      <ContextMenuHost />
      <DialogHost />
    </div>
  );
}
