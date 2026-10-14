import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextEditor from '@/applications/text-editor/TextEditor';
import { findMatches, lineCol, replaceAllMatches } from '@/applications/text-editor/logic';
import { isDirty, useDocs } from '@/stores/docsStore';
import { useSettings } from '@/stores/settingsStore';
import { useWindows } from '@/stores/windowStore';
import { useFs, ROOT_ID } from '@/services/fsStore';
import { requestClose } from '@/services/closeGuards';
import { appProps, renderWithDialogs, resetAll } from './helpers';

describe('editor logic', () => {
  it('finds matches case-insensitively or exactly', () => {
    expect(findMatches('Foo foo FOO', 'foo', false)).toEqual([0, 4, 8]);
    expect(findMatches('Foo foo FOO', 'foo', true)).toEqual([4]);
    expect(findMatches('abc', '', false)).toEqual([]);
    expect(findMatches('aaaa', 'aa', false)).toEqual([0, 2]);
  });
  it('replaces all matches', () => {
    expect(replaceAllMatches('a-b-c', '-', '+', false)).toEqual({ text: 'a+b+c', count: 2 });
    expect(replaceAllMatches('abc', 'z', 'y', false)).toEqual({ text: 'abc', count: 0 });
  });
  it('computes line and column', () => {
    expect(lineCol('ab\ncd', 4)).toEqual({ line: 2, col: 2 });
    expect(lineCol('', 0)).toEqual({ line: 1, col: 1 });
  });
});

describe('Text Editor', () => {
  beforeEach(async () => {
    await resetAll();
    useSettings.getState().update({ editor: { autosave: false } });
  });

  it('shows an empty state and creates a document', async () => {
    renderWithDialogs(<TextEditor {...appProps} />);
    expect(screen.getByText('No document open')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'New document' })[0]);
    expect(screen.getByRole('tab', { name: 'Untitled.txt' })).toBeInTheDocument();
    expect(screen.getByLabelText('Editing Untitled.txt')).toBeInTheDocument();
  });

  it('edits text, shows word and character counts, and tracks dirty state', async () => {
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'New document' })[0]);
    await userEvent.type(screen.getByLabelText('Editing Untitled.txt'), 'hello brave new world');
    expect(screen.getByText(/4 words · 21 characters/)).toBeInTheDocument();
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes', { selector: 'span' })).toBeInTheDocument();
    expect(isDirty(useDocs.getState().docs[0])).toBe(true);
  });

  it('manual save asks for a name for untitled documents and clears the dirty marker', async () => {
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'New document' })[0]);
    await userEvent.type(screen.getByLabelText('Editing Untitled.txt'), 'content');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dlg = await screen.findByRole('dialog');
    const input = within(dlg).getByLabelText('Document name');
    await userEvent.clear(input);
    await userEvent.type(input, 'journal.txt{Enter}');
    await waitFor(() => expect(isDirty(useDocs.getState().docs[0])).toBe(false));
    expect(useDocs.getState().docs[0]).toMatchObject({ name: 'journal.txt', savedContent: 'content', untitled: false });
    expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('Ctrl+S saves from inside the editor', async () => {
    useDocs.getState().create({ name: 'a.txt', content: 'one' });
    renderWithDialogs(<TextEditor {...appProps} />);
    const ta = await screen.findByLabelText('Editing a.txt');
    await userEvent.type(ta, ' two');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(useDocs.getState().docs[0].savedContent).toBe('one two'));
  });

  it('autosaves after a pause when enabled', async () => {
    useSettings.getState().update({ editor: { autosave: true } });
    useDocs.getState().create({ name: 'auto.txt', content: '' });
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.type(await screen.findByLabelText('Editing auto.txt'), 'typed');
    expect(isDirty(useDocs.getState().docs[0])).toBe(true);
    await waitFor(() => expect(isDirty(useDocs.getState().docs[0])).toBe(false), { timeout: 3000 });
    expect(useDocs.getState().docs[0].savedContent).toBe('typed');
  });

  it('supports multiple documents in tabs', async () => {
    useDocs.getState().create({ name: 'one.txt', content: '1' });
    useDocs.getState().create({ name: 'two.txt', content: '2' });
    renderWithDialogs(<TextEditor {...appProps} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByLabelText('Editing two.txt')).toHaveValue('2');
    await userEvent.click(screen.getByRole('tab', { name: 'one.txt' }));
    expect(screen.getByLabelText('Editing one.txt')).toHaveValue('1');
  });

  it('protects unsaved changes when closing a tab: Cancel keeps it open', async () => {
    const id = useDocs.getState().create({ name: 'x.txt', content: 'a' });
    useDocs.getState().edit(id, 'a changed');
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close x.txt' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('has unsaved changes');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('tab', { name: /x\.txt/ })).toBeInTheDocument();
    expect(useDocs.getState().docs[0].content).toBe('a changed');
  });

  it('Save from the close dialog saves and closes; Don\'t save discards the draft', async () => {
    const a = useDocs.getState().create({ name: 'a.txt', content: 'old' });
    useDocs.getState().edit(a, 'new');
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close a.txt' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /a\.txt/ })).not.toBeInTheDocument());
    expect(useDocs.getState().docs[0].savedContent).toBe('new');

    const b = useDocs.getState().create({ name: 'b.txt', content: 'keep' });
    useDocs.getState().edit(b, 'throwaway');
    await userEvent.click(await screen.findByRole('button', { name: 'Close b.txt' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: "Don't save" }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /b\.txt/ })).not.toBeInTheDocument());
    expect(useDocs.getState().docs.find((d) => d.id === b)!.content).toBe('keep');
  });

  it('closing the whole window is vetoed while there are unsaved changes', async () => {
    const winId = useWindows.getState().openApp('editor')!;
    const id = useDocs.getState().create({ name: 'w.txt', content: 'a' });
    useDocs.getState().edit(id, 'b');
    renderWithDialogs(<TextEditor {...appProps} windowId={winId} />);
    let closed: boolean | undefined;
    await act(async () => {
      const p = requestClose(winId).then((v) => (closed = v));
      await screen.findByRole('alertdialog');
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
      await p;
    });
    expect(closed).toBe(false);
    expect(useWindows.getState().windows[winId]).toBeDefined();
  });

  it('finds text and reports match counts', async () => {
    useDocs.getState().create({ name: 'f.txt', content: 'cat dog cat bird CAT' });
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Find in document' }));
    await userEvent.type(screen.getByLabelText('Find'), 'cat');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Match case'));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Find'));
    await userEvent.type(screen.getByLabelText('Find'), 'zebra');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('replaces all occurrences', async () => {
    useDocs.getState().create({ name: 'r.txt', content: 'a a a' });
    renderWithDialogs(<TextEditor {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Find in document' }));
    await userEvent.type(screen.getByLabelText('Find'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Toggle replace' }));
    await userEvent.type(screen.getByLabelText('Replace with'), 'b');
    await userEvent.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(useDocs.getState().docs[0].content).toBe('b b b');
  });

  it('opens a file from Solace Files, linked, and writes saves back to it', async () => {
    await useFs.getState().load();
    const file = await useFs.getState().createTextFile(ROOT_ID, 'linked.txt', 'from files');
    renderWithDialogs(<TextEditor {...appProps} props={{ fileId: file.id }} />);
    const ta = await screen.findByLabelText('Editing linked.txt');
    expect(ta).toHaveValue('from files');
    await userEvent.type(ta, '!');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(async () => expect(await (await useFs.getState().readBlob(file.id))!.text()).toBe('from files!'));
  });

  it('shows an error for a file that cannot be opened', async () => {
    await useFs.getState().load();
    renderWithDialogs(<TextEditor {...appProps} props={{ fileId: 'does-not-exist' }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be found/i);
  });

  it('keeps drafts across a simulated reload (persistence)', async () => {
    const id = useDocs.getState().create({ name: 'p.txt', content: 'saved' });
    useDocs.getState().edit(id, 'draft in progress');
    const { flushPersistence } = await import('@/services/zustandIdb');
    const { idbGet, idbSet } = await import('@/services/idb');
    await flushPersistence();
    const raw = await idbGet<string>('kv', 'solace.docs.v1');
    expect(raw).toContain('draft in progress');
    // "Reload": wipe in-memory state, keep only what reached IndexedDB.
    useDocs.setState({ docs: [], openIds: [], activeId: null });
    await flushPersistence();
    await idbSet('kv', 'solace.docs.v1', raw);
    await act(async () => {
      await useDocs.persist.rehydrate();
    });
    const doc = useDocs.getState().docs[0];
    expect(doc).toMatchObject({ name: 'p.txt', content: 'draft in progress', savedContent: 'saved' });
    expect(isDirty(doc)).toBe(true);
  });
});
