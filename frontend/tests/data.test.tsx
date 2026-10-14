import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { applyImport, buildExport, parseImport, EXPORT_FORMAT } from '@/services/dataTransfer';
import { useNotes } from '@/stores/notesStore';
import { useTasks } from '@/stores/tasksStore';
import { useEvents } from '@/stores/eventsStore';
import { useDocs } from '@/stores/docsStore';
import { useSettings } from '@/stores/settingsStore';
import { useWidgets, WIDGET_META, type WidgetType } from '@/stores/widgetStore';
import { useBookmarks } from '@/applications/browser/bookmarksStore';
import Browser from '@/applications/browser/Browser';
import Settings from '@/applications/settings/Settings';
import { WidgetLayer } from '@/desktop/widgets/WidgetLayer';
import { appProps, renderWithDialogs, resetAll } from './helpers';
import { render } from '@testing-library/react';

describe('export / import', () => {
  beforeEach(async () => {
    await resetAll();
  });

  const seed = () => {
    useNotes.getState().create({ title: 'N', content: 'body' });
    useTasks.getState().add({ title: 'T', due: '2030-01-01', priority: 'high' });
    useEvents.getState().add({ title: 'E', start: 1, end: 2, allDay: false, location: '', description: '' });
    useDocs.getState().create({ name: 'd.txt', content: 'doc' });
    useBookmarks.getState().add('Wiki', 'https://www.wikipedia.org/');
    useSettings.getState().update({ theme: 'light', accent: 'rose' });
  };

  it('round-trips all local data', () => {
    seed();
    const text = JSON.stringify(buildExport());
    const parsed = parseImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts).toMatchObject({ Notes: 1, Tasks: 1, Events: 1, Documents: 1, Bookmarks: 1 });
    useNotes.getState().replaceAll([]);
    useTasks.getState().replaceAll([]);
    act(() => applyImport(parsed.bundle));
    expect(useNotes.getState().notes[0]).toMatchObject({ title: 'N', content: 'body' });
    expect(useTasks.getState().tasks[0]).toMatchObject({ title: 'T', priority: 'high', due: '2030-01-01' });
    expect(useDocs.getState().docs[0].name).toBe('d.txt');
    expect(useSettings.getState().settings.theme).toBe('light');
  });

  it('rejects malformed, foreign and oversized input', () => {
    expect(parseImport('not json')).toMatchObject({ ok: false });
    expect(parseImport('[]')).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ format: 'something-else', version: 1, data: {} }))).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 99, data: {} }))).toMatchObject({ ok: false });
    expect(parseImport('x'.repeat(21 * 1024 * 1024))).toMatchObject({ ok: false, error: expect.stringMatching(/too large/) });
  });

  it('sanitises untrusted content instead of trusting it', () => {
    const evil = {
      format: EXPORT_FORMAT, version: 1, appVersion: '9', exportedAt: 'now',
      data: {
        settings: { theme: 'light', __proto__: { polluted: true }, bogus: 1, dock: { position: 'sideways-but-string' } },
        notes: [{ id: 5, title: { x: 1 }, content: 'ok', pinned: 'yes' }, 'junk', null],
        tasks: [{ title: '' }, { title: 'Real', priority: 'urgent', due: 'tomorrow' }],
        events: [{ title: 'No dates' }, { title: 'Good', start: 10, end: 5 }],
        widgets: [{ type: 'evil', x: 1 }, { type: 'clock', x: 'NaN' }],
        bookmarks: [{ url: 'javascript:alert(1)', title: 'x' }, { url: 'https://ok.example/', title: 'ok' }],
        desktopIcons: [{ appId: 'files', col: -3, row: 2.7 }, { appId: '' }],
      },
    };
    const r = parseImport(JSON.stringify(evil));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.bundle.data;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(d.notes[0]).toMatchObject({ title: '', content: 'ok', pinned: false });
    expect(d.notes).toHaveLength(1); // non-object junk entries are dropped
    expect(d.tasks).toEqual([expect.objectContaining({ title: 'Real', priority: 'medium', due: null })]);
    expect(d.events).toEqual([expect.objectContaining({ title: 'Good', start: 10, end: 10 })]);
    expect(d.widgets).toEqual([expect.objectContaining({ type: 'clock', x: 0 })]);
    expect(d.bookmarks.map((b) => b.url)).toEqual(['https://ok.example/']);
    expect(d.desktopIcons).toEqual([{ appId: 'files', col: 0, row: 2 }]);
    expect(d.settings.theme).toBe('light');
    expect((d.settings as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('the Storage settings page previews an import and requires confirmation before replacing', async () => {
    seed();
    const text = JSON.stringify(buildExport());
    useNotes.getState().replaceAll([]);
    renderWithDialogs(<Settings {...appProps} props={{ section: 'storage' }} />);
    const input = screen.getByLabelText('Choose a Solace export file') as HTMLInputElement;
    await userEvent.upload(input, new File([text], 'export.json', { type: 'application/json' }));
    expect(await screen.findByText(/This file contains/)).toBeInTheDocument();
    expect(screen.getByText(/1 notes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Import…' }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(useNotes.getState().notes).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Import…' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace my data' }));
    expect(useNotes.getState().notes).toHaveLength(1);
  });

  it('shows an error for an invalid import file', async () => {
    renderWithDialogs(<Settings {...appProps} props={{ section: 'storage' }} />);
    await userEvent.upload(screen.getByLabelText('Choose a Solace export file'), new File(['{"nope":1}'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a Solace OS export/i);
  });
});

describe('widgets', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('provides all six widget types', () => {
    expect(Object.keys(WIDGET_META).sort()).toEqual(['calendar', 'clock', 'notes', 'quicklaunch', 'tasks', 'timer']);
  });

  it('adds, positions, configures and removes widgets independently, persisting them', () => {
    const a = useWidgets.getState().add('clock');
    const b = useWidgets.getState().add('timer', { x: 300, y: 200 });
    useWidgets.getState().update(a, { x: 500, y: 80 });
    useWidgets.getState().setConfig(b, { minutes: 10 });
    expect(useWidgets.getState().widgets.find((w) => w.id === a)).toMatchObject({ x: 500, y: 80 });
    expect(useWidgets.getState().widgets.find((w) => w.id === b)).toMatchObject({ x: 300, config: { minutes: 10 } });
    expect(JSON.parse(localStorage.getItem('solace.widgets.v1')!).state.widgets).toHaveLength(2);
    useWidgets.getState().remove(a);
    expect(useWidgets.getState().widgets.map((w) => w.id)).toEqual([b]);
  });

  it('renders each widget and lets the user remove one', async () => {
    for (const t of Object.keys(WIDGET_META) as WidgetType[]) useWidgets.getState().add(t);
    render(<WidgetLayer />);
    for (const t of Object.keys(WIDGET_META) as WidgetType[]) expect(screen.getByRole('region', { name: `${WIDGET_META[t].label} widget` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Clock widget' }));
    expect(screen.queryByRole('region', { name: 'Clock widget' })).not.toBeInTheDocument();
  });

  it('can be hidden globally without deleting them', () => {
    useWidgets.getState().add('clock');
    useSettings.getState().update({ widgetsVisible: false });
    render(<WidgetLayer />);
    expect(screen.queryByRole('region', { name: 'Clock widget' })).not.toBeInTheDocument();
    expect(useWidgets.getState().widgets).toHaveLength(1);
  });

  it('widgets never intercept clicks outside themselves (layer is pointer-events:none)', () => {
    useWidgets.getState().add('clock');
    const { container } = render(<WidgetLayer />);
    expect((container.firstChild as HTMLElement).className).toContain('pointer-events-none');
    expect(container.querySelector('section')!.className).toContain('pointer-events-auto');
  });

  it('widgets can be dragged and the new position persists', () => {
    const id = useWidgets.getState().add('clock', { x: 100, y: 100 });
    render(<WidgetLayer />);
    const handle = screen.getByTitle('Drag to move');
    fireEvent.pointerDown(handle, { clientX: 150, clientY: 110, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 250, clientY: 160, pointerId: 1 });
    expect(useWidgets.getState().widgets.find((w) => w.id === id)).toMatchObject({ x: 200, y: 150 });
  });

  it('the notes and tasks widgets reflect live data', async () => {
    useNotes.getState().create({ title: 'Pinned thought', content: 'abc' });
    useTasks.getState().add({ title: 'Ship it' });
    useWidgets.getState().add('notes');
    useWidgets.getState().add('tasks');
    render(<WidgetLayer />);
    expect(screen.getByText('Pinned thought')).toBeInTheDocument();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Complete Ship it' }));
    expect(useTasks.getState().tasks[0].done).toBe(true);
    expect(screen.getByText('Everything is done.')).toBeInTheDocument();
  });

  it('the timer widget counts down controls and reset', async () => {
    useWidgets.getState().add('timer');
    render(<WidgetLayer />);
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    await userEvent.click(screen.getByRole('button', { name: '10m' }));
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    expect(screen.getByRole('button', { name: 'Pause timer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
  });
});

describe('Web start page (browser shortcuts)', () => {
  beforeEach(async () => {
    await resetAll();
    useBookmarks.setState({ bookmarks: [], visits: [] });
  });

  it('says plainly that websites are external and opens in a new tab', () => {
    render(<Browser {...appProps} />);
    expect(screen.getByText(/open in a new browser tab, outside Solace/i)).toBeInTheDocument();
  });

  it('rejects unsafe or malformed addresses and never opens a window for them', async () => {
    const opened: unknown[] = [];
    const orig = window.open;
    window.open = ((...a: unknown[]) => (opened.push(a), null)) as typeof window.open;
    try {
      render(<Browser {...appProps} />);
      await userEvent.type(screen.getByLabelText('Web address'), 'javascript:alert(1){Enter}');
      expect(screen.getByRole('alert')).toHaveTextContent(/valid web address/i);
      expect(opened).toHaveLength(0);
      await userEvent.clear(screen.getByLabelText('Web address'));
      await userEvent.type(screen.getByLabelText('Web address'), 'example.com{Enter}');
      expect(opened).toEqual([['https://example.com/', '_blank', 'noopener,noreferrer']]);
    } finally {
      window.open = orig;
    }
  });

  it('saves, lists and removes sites; links are external, noopener and labelled', async () => {
    render(<Browser {...appProps} />);
    expect(screen.getByText('No sites saved yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add site/i }));
    await userEvent.type(screen.getByLabelText('Site name'), 'Docs');
    await userEvent.type(screen.getByLabelText('Site address'), 'developer.mozilla.org');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const link = screen.getByRole('link', { name: /Docs/ });
    expect(link).toHaveAttribute('href', 'https://developer.mozilla.org/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent(/external website/i);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Docs' }));
    expect(screen.getByText('No sites saved yet')).toBeInTheDocument();
  });

  it('refuses to save an invalid site', async () => {
    render(<Browser {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: /add site/i }));
    await userEvent.type(screen.getByLabelText('Site address'), 'data:text/html,hi');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid http/i);
    expect(useBookmarks.getState().bookmarks).toHaveLength(0);
  });
});
