import { useEffect, useState, type ComponentType } from 'react';
import { Bell, Dock, HardDrive, Image, Info, Keyboard, LayoutGrid, Layers, Monitor, Palette, RotateCcw, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { cn } from '@/utils/cn';
import { AppearanceSection, WallpaperSection } from './AppearanceSections';
import { DesktopSection, DockSection, NotificationsSection, WidgetsSection } from './ShellSections';
import { AboutSection, PrivacySection, ResetSection, ShortcutsSection, StorageSection, WorkspaceSection } from './SystemSections';
import { AccountSection } from './AccountSection';

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
}

export const SECTIONS: Section[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, component: AppearanceSection },
  { id: 'wallpapers', label: 'Wallpapers', icon: Image, component: WallpaperSection },
  { id: 'desktop', label: 'Desktop icons', icon: LayoutGrid, component: DesktopSection },
  { id: 'dock', label: 'Dock & taskbar', icon: Dock, component: DockSection },
  { id: 'widgets', label: 'Widgets', icon: Layers, component: WidgetsSection },
  { id: 'notifications', label: 'Notifications', icon: Bell, component: NotificationsSection },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, component: ShortcutsSection },
  { id: 'workspace', label: 'Workspace', icon: Monitor, component: WorkspaceSection },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck, component: PrivacySection },
  { id: 'storage', label: 'Storage', icon: HardDrive, component: StorageSection },
  { id: 'account', label: 'Account', icon: UserRound, component: AccountSection },
  { id: 'about', label: 'About Solace OS', icon: Info, component: AboutSection },
  { id: 'reset', label: 'Reset', icon: RotateCcw, component: ResetSection },
];

export default function Settings({ props }: AppComponentProps) {
  const [section, setSection] = useState(typeof props.section === 'string' && SECTIONS.some((s) => s.id === props.section) ? (props.section as string) : 'appearance');

  useEffect(() => {
    if (typeof props.section === 'string' && SECTIONS.some((s) => s.id === props.section)) setSection(props.section);
  }, [props.section, props.at]);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const Body = current.component;

  return (
    <div className="flex h-full flex-col @[640px]:flex-row">
      <nav aria-label="Settings sections" className="hidden w-[210px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-chrome p-2 @[640px]:flex">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            aria-current={s.id === section ? 'page' : undefined}
            className={cn('flex items-center gap-2.5 rounded-[var(--s-radius-sm)] border-0 px-2.5 py-2 text-left text-[13px]', s.id === section ? 'bg-accentsoft text-ink' : 'bg-transparent text-dim hover:bg-surface3 hover:text-ink')}
          >
            <s.icon size={15} aria-hidden /> {s.label}
          </button>
        ))}
      </nav>
      <div className="border-b border-line p-2 @[640px]:hidden">
        <select className="s-input w-full" aria-label="Settings section" value={section} onChange={(e) => setSection(e.target.value)}>
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5" aria-label={current.label}>
        <h1 className="m-0 mb-4 text-[20px] font-semibold">{current.label}</h1>
        <Body />
      </main>
    </div>
  );
}
