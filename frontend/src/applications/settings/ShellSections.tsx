import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { APPS, getApp } from '../registry';
import { useSettings } from '@/stores/settingsStore';
import { useDesktop } from '@/stores/desktopStore';
import { useWidgets, WIDGET_META, type WidgetType } from '@/stores/widgetStore';
import { useWindows } from '@/stores/windowStore';
import { Group, Row } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { AppIcon } from '@/components/ui/AppIcon';
import { notify } from '@/stores/notificationStore';
import type { DockPosition, DockSize, DockStyle, IconSize } from '@/types/settings';

export function DesktopSection() {
  const icons = useSettings((s) => s.settings.desktopIcons);
  const update = useSettings((s) => s.update);
  const shortcuts = useDesktop((s) => s.icons);
  const { add, remove, reset } = useDesktop.getState();
  const rows = Math.max(1, Math.floor((useWindows.getState().workArea.h - 10) / 104));
  return (
    <>
      <Group title="Desktop icons">
        <Row title="Show desktop icons"><Switch label="Show desktop icons" checked={icons.visible} onChange={(v) => update({ desktopIcons: { visible: v } })} /></Row>
        <Row title="Icon size">
          <Segmented<IconSize> label="Icon size" value={icons.size} onChange={(v) => update({ desktopIcons: { size: v } })} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
        </Row>
        <Row title="Show labels"><Switch label="Show icon labels" checked={icons.labels} onChange={(v) => update({ desktopIcons: { labels: v } })} /></Row>
        <Row title="Reset layout" hint="Restore the default shortcuts and positions."><button className="s-btn" onClick={() => reset(rows)}>Reset icons</button></Row>
      </Group>
      <Group title="Shortcuts on the desktop">
        {APPS.map((a) => {
          const on = shortcuts.some((i) => i.appId === a.id);
          return (
            <Row key={a.id} title={a.name}>
              <Switch label={`Show ${a.name} on desktop`} checked={on} onChange={(v) => (v ? add(a.id, rows) : remove(a.id))} />
            </Row>
          );
        })}
      </Group>
    </>
  );
}

export function DockSection() {
  const dock = useSettings((s) => s.settings.dock);
  const update = useSettings((s) => s.update);
  const { pin, unpin, movePinned } = useSettings.getState();
  const unpinned = APPS.filter((a) => !dock.pinned.includes(a.id));
  return (
    <>
      <Group title="Taskbar">
        <Row title="Position">
          <Segmented<DockPosition> label="Dock position" value={dock.position} onChange={(v) => update({ dock: { position: v } })} options={[{ value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
        </Row>
        <Row title="Style" hint="Floating shows a compact dock; Bar spans the full edge.">
          <Segmented<DockStyle> label="Dock style" value={dock.style} onChange={(v) => update({ dock: { style: v } })} options={[{ value: 'floating', label: 'Floating' }, { value: 'bar', label: 'Bar' }]} />
        </Row>
        <Row title="Icon size">
          <Segmented<DockSize> label="Dock size" value={dock.size} onChange={(v) => update({ dock: { size: v } })} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
        </Row>
        <Row title="Show app names" hint="Only on a horizontal dock."><Switch label="Show app names" checked={dock.showLabels} onChange={(v) => update({ dock: { showLabels: v } })} /></Row>
      </Group>
      <Group title="Pinned apps">
        {dock.pinned.length === 0 && <p className="py-3 text-[12.5px] text-dim">No pinned apps. Add some below.</p>}
        {dock.pinned.map((id, idx) => {
          const app = getApp(id);
          if (!app) return null;
          return (
            <Row key={id} title={app.name}>
              <AppIcon icon={app.icon} size={26} />
              <button className="s-icon-btn" aria-label={`Move ${app.name} earlier`} disabled={idx === 0} onClick={() => movePinned(id, -1)}><ArrowUp size={14} /></button>
              <button className="s-icon-btn" aria-label={`Move ${app.name} later`} disabled={idx === dock.pinned.length - 1} onClick={() => movePinned(id, 1)}><ArrowDown size={14} /></button>
              <button className="s-icon-btn hover:!text-danger" aria-label={`Unpin ${app.name}`} onClick={() => unpin(id)}><Trash2 size={14} /></button>
            </Row>
          );
        })}
        {unpinned.length > 0 && (
          <Row title="Add to dock">
            <select className="s-input" aria-label="Pin an application" value="" onChange={(e) => e.target.value && pin(e.target.value)}>
              <option value="">Choose app…</option>
              {unpinned.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Row>
        )}
      </Group>
    </>
  );
}

export function WidgetsSection() {
  const visible = useSettings((s) => s.settings.widgetsVisible);
  const update = useSettings((s) => s.update);
  const widgets = useWidgets((s) => s.widgets);
  const { add, remove, clear } = useWidgets.getState();
  return (
    <>
      <Group title="Widgets">
        <Row title="Show widgets on the desktop" hint="Widgets sit behind your windows, so they never get in the way."><Switch label="Show widgets" checked={visible} onChange={(v) => update({ widgetsVisible: v })} /></Row>
      </Group>
      <Group title="Add a widget">
        {(Object.keys(WIDGET_META) as WidgetType[]).map((t) => (
          <Row key={t} title={WIDGET_META[t].label} hint={WIDGET_META[t].description}>
            <button className="s-btn" onClick={() => { if (!visible) update({ widgetsVisible: true }); add(t); }}><Plus size={14} /> Add</button>
          </Row>
        ))}
      </Group>
      <Group title="On your desktop">
        {widgets.length === 0 ? <p className="py-3 text-[12.5px] text-dim">No widgets yet.</p> : widgets.map((w) => (
          <Row key={w.id} title={WIDGET_META[w.type].label}>
            <button className="s-btn s-btn-danger" onClick={() => remove(w.id)}><Trash2 size={14} /> Remove</button>
          </Row>
        ))}
        {widgets.length > 1 && <Row title="Remove all widgets"><button className="s-btn s-btn-danger" onClick={clear}>Remove all</button></Row>}
      </Group>
    </>
  );
}

export function NotificationsSection() {
  const n = useSettings((s) => s.settings.notifications);
  const update = useSettings((s) => s.update);
  return (
    <Group title="Notifications">
      <Row title="Enable notifications" hint="Solace's own notices, such as finished timers and import results. Solace does not use browser push notifications."><Switch label="Enable notifications" checked={n.enabled} onChange={(v) => update({ notifications: { enabled: v } })} /></Row>
      <Row title="Do not disturb" hint="Notifications are still collected, but won't pop up."><Switch label="Do not disturb" checked={n.doNotDisturb} disabled={!n.enabled} onChange={(v) => update({ notifications: { doNotDisturb: v } })} /></Row>
      <Row title="Send a test notification"><button className="s-btn" disabled={!n.enabled} onClick={() => notify({ title: 'Test notification', body: 'Notifications are working.', level: 'success', appId: 'settings' })}>Send test</button></Row>
    </Group>
  );
}
