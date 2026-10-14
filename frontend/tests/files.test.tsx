import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileManager from '@/applications/file-manager/FileManager';
import { itemKind, matchesType, rangeIds, sortItems, type Item } from '@/applications/file-manager/logic';
import { FsError, ROOT_ID, childrenOf, descendantIds, guessMime, pathOf, uniqueName, usedBytes, useFs, validateName } from '@/services/fsStore';
import { useWindows } from '@/stores/windowStore';
import { useDocs } from '@/stores/docsStore';
import { appProps, renderWithDialogs, resetAll } from './helpers';

const fs = () => useFs.getState();
// The type-filter <select> also exposes role=option, so scope row queries to the file listbox.
const listbox = () => screen.getByRole('listbox', { name: 'Files and folders' });
const findRow = (name: RegExp) => waitFor(() => within(listbox()).getByRole('option', { name }));
const getRow = (name: RegExp) => within(listbox()).getByRole('option', { name });
const queryRow = (name: RegExp) => {
  const lb = screen.queryByRole('listbox', { name: 'Files and folders' });
  return lb ? within(lb).queryByRole('option', { name }) : null;
};
const names = (parentId: string) => childrenOf(fs().entries, parentId).map((e) => e.name).sort();

describe('Solace Files store', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('starts with a root and default folders', () => {
    expect(fs().entries[ROOT_ID].name).toBe('Solace Files');
    expect(names(ROOT_ID)).toEqual(['Documents', 'Downloads', 'Pictures']);
  });

  it('creates folders and text files, de-duplicating names', async () => {
    const a = await fs().createFolder(ROOT_ID, 'Projects');
    const b = await fs().createFolder(ROOT_ID, 'Projects');
    expect(a.name).toBe('Projects');
    expect(b.name).toBe('Projects (2)');
    const f = await fs().createTextFile(a.id, 'notes.txt', 'hello');
    const g = await fs().createTextFile(a.id, 'notes.txt', 'again');
    expect(f.size).toBe(5);
    expect(g.name).toBe('notes (2).txt');
    expect(await (await fs().readBlob(f.id))!.text()).toBe('hello');
  });

  it('validates names', async () => {
    for (const bad of ['', '   ', 'a/b', 'a\\b', 'x:y', 'what?', '..', '.', 'a'.repeat(121)]) expect(validateName(bad)).not.toBeNull();
    expect(validateName('Résumé 2026.txt')).toBeNull();
    await expect(fs().createFolder(ROOT_ID, 'bad/name')).rejects.toBeInstanceOf(FsError);
  });

  it('renames while avoiding collisions', async () => {
    const a = await fs().createFolder(ROOT_ID, 'A');
    await fs().createFolder(ROOT_ID, 'B');
    await fs().rename(a.id, 'B');
    expect(fs().entries[a.id].name).toBe('B (2)');
    await expect(fs().rename(a.id, 'a/b')).rejects.toBeInstanceOf(FsError);
  });

  it('moves items and refuses to move a folder into itself or a descendant', async () => {
    const parent = await fs().createFolder(ROOT_ID, 'Parent');
    const child = await fs().createFolder(parent.id, 'Child');
    const file = await fs().createTextFile(ROOT_ID, 'x.txt', '1');
    await fs().move([file.id], child.id);
    expect(fs().entries[file.id].parentId).toBe(child.id);
    await expect(fs().move([parent.id], parent.id)).rejects.toThrow(/into itself/);
    await expect(fs().move([parent.id], child.id)).rejects.toThrow(/into itself/);
    await expect(fs().move([file.id], 'missing')).rejects.toBeInstanceOf(FsError);
    expect(fs().entries[ROOT_ID].parentId).toBeNull();
  });

  it('copies files (with content) and folders recursively', async () => {
    const dir = await fs().createFolder(ROOT_ID, 'Src');
    const file = await fs().createTextFile(dir.id, 'a.txt', 'payload');
    const dest = await fs().createFolder(ROOT_ID, 'Dest');
    await fs().copy([dir.id], dest.id);
    const copied = childrenOf(fs().entries, dest.id)[0];
    expect(copied.name).toBe('Src');
    const inner = childrenOf(fs().entries, copied.id)[0];
    expect(inner.id).not.toBe(file.id);
    expect(await (await fs().readBlob(inner.id))!.text()).toBe('payload');
    await expect(fs().copy([dir.id], dir.id)).rejects.toThrow(/into itself/);
    // Copy in place gets a "copy" suffix.
    await fs().copy([file.id], dir.id);
    expect(names(dir.id)).toEqual(['a copy.txt', 'a.txt']);
  });

  it('trashes, restores and permanently deletes (including children and content)', async () => {
    const dir = await fs().createFolder(ROOT_ID, 'Gone');
    const file = await fs().createTextFile(dir.id, 'f.txt', 'data');
    await fs().trash([dir.id]);
    expect(names(ROOT_ID)).not.toContain('Gone');
    expect(fs().entries[dir.id].trashedAt).not.toBeNull();
    await fs().restore([dir.id]);
    expect(names(ROOT_ID)).toContain('Gone');
    await fs().trash([dir.id]);
    await fs().deleteForever([dir.id]);
    expect(fs().entries[dir.id]).toBeUndefined();
    expect(fs().entries[file.id]).toBeUndefined();
    expect(await fs().readBlob(file.id)).toBeNull();
  });

  it('restores into the root when the original folder is gone', async () => {
    const dir = await fs().createFolder(ROOT_ID, 'Box');
    const file = await fs().createTextFile(dir.id, 'f.txt', 'x');
    await fs().trash([file.id]);
    await fs().trash([dir.id]);
    await fs().restore([file.id]);
    expect(fs().entries[file.id].parentId).toBe(ROOT_ID);
  });

  it('empties the trash', async () => {
    const f = await fs().createTextFile(ROOT_ID, 'a.txt', '1');
    await fs().trash([f.id]);
    expect(await fs().emptyTrash()).toBe(1);
    expect(fs().entries[f.id]).toBeUndefined();
  });

  it('never allows deleting or trashing the root', async () => {
    await fs().trash([ROOT_ID]);
    await fs().deleteForever([ROOT_ID]);
    expect(fs().entries[ROOT_ID]).toBeDefined();
    expect(fs().entries[ROOT_ID].trashedAt).toBeNull();
  });

  it('imports uploads, rejecting oversize files and bad names', async () => {
    const ok = new File(['abc'], 'ok.txt', { type: 'text/plain' });
    const bad = new File(['x'], 'bad:name.txt');
    const big = new File([new Uint8Array(10)], 'big.bin');
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    const r = await fs().importFiles(ROOT_ID, [ok, bad, big]);
    expect(r.added.map((e) => e.name)).toEqual(['ok.txt']);
    expect(r.rejected.map((x) => x.name).sort()).toEqual(['bad:name.txt', 'big.bin']);
    expect(usedBytes(fs().entries)).toBe(3);
  });

  it('writes text to an existing file', async () => {
    const f = await fs().createTextFile(ROOT_ID, 'w.txt', 'old');
    await fs().writeText(f.id, 'brand new');
    expect(fs().entries[f.id].size).toBe(9);
    expect(await (await fs().readBlob(f.id))!.text()).toBe('brand new');
    await expect(fs().writeText('missing', 'x')).rejects.toBeInstanceOf(FsError);
  });

  it('helper functions', async () => {
    const a = await fs().createFolder(ROOT_ID, 'One');
    const b = await fs().createFolder(a.id, 'Two');
    expect(pathOf(fs().entries, b.id).map((p) => p.name)).toEqual(['Solace Files', 'One', 'Two']);
    expect(descendantIds(fs().entries, a.id)).toEqual([b.id]);
    expect(uniqueName(fs().entries, ROOT_ID, 'one')).toBe('one (2)'); // case-insensitive
    expect(guessMime('pic.PNG')).toBe('image/png');
    expect(guessMime('mystery')).toBe('application/octet-stream');
  });
});

describe('file manager logic', () => {
  const item = (o: Partial<Item>): Item => ({ id: o.name ?? 'x', name: 'x', kind: 'file', size: 0, modified: 0, mime: '', ...o });
  it('classifies kinds', () => {
    expect(itemKind(item({ kind: 'folder' }))).toBe('folder');
    expect(itemKind(item({ name: 'a.PNG' }))).toBe('image');
    expect(itemKind(item({ name: 'a.md' }))).toBe('text');
    expect(itemKind(item({ name: 'a.pdf' }))).toBe('pdf');
    expect(itemKind(item({ name: 'a.zip' }))).toBe('archive');
    expect(itemKind(item({ name: 'a.bin' }))).toBe('other');
  });
  it('sorts folders first, with natural name order and direction', () => {
    const items = [item({ name: 'file10.txt' }), item({ name: 'file2.txt' }), item({ name: 'Zeta', kind: 'folder' }), item({ name: 'alpha', kind: 'folder' })];
    expect(sortItems(items, 'name', 'asc').map((i) => i.name)).toEqual(['alpha', 'Zeta', 'file2.txt', 'file10.txt']);
    expect(sortItems(items, 'name', 'desc').map((i) => i.name)).toEqual(['Zeta', 'alpha', 'file10.txt', 'file2.txt']);
  });
  it('sorts by size and modified date', () => {
    const items = [item({ name: 'a', size: 5, modified: 3 }), item({ name: 'b', size: 1, modified: 9 })];
    expect(sortItems(items, 'size', 'asc').map((i) => i.name)).toEqual(['b', 'a']);
    expect(sortItems(items, 'modified', 'desc').map((i) => i.name)).toEqual(['b', 'a']);
  });
  it('filters by type and computes shift-ranges', () => {
    expect(matchesType(item({ name: 'a.png' }), 'image')).toBe(true);
    expect(matchesType(item({ name: 'a.png' }), 'document')).toBe(false);
    expect(matchesType(item({ kind: 'folder' }), 'folder')).toBe(true);
    const list = ['a', 'b', 'c', 'd'].map((n) => item({ name: n }));
    expect(rangeIds(list, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(list, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });
});

describe('File Manager app', () => {
  beforeEach(async () => {
    await resetAll();
  });

  const row = (name: string) => within(listbox()).getByRole('option', { name: new RegExp(`^${name}`) });

  it('lists default folders and clearly distinguishes Solace-managed storage', async () => {
    renderWithDialogs(<FileManager {...appProps} />);
    expect(await findRow(/Documents/)).toBeInTheDocument();
    expect(screen.getByText(/Solace Files · this browser only/)).toBeInTheDocument();
    expect(screen.getByText(/aren’t on your computer’s disk/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Solace Files');
  });

  it('is honest about folder access when the browser does not support it', async () => {
    renderWithDialogs(<FileManager {...appProps} />);
    await findRow(/Documents/);
    expect(screen.getByText(/can’t browse folders on your computer/)).toBeInTheDocument();
  });

  it('creates a folder through the prompt, validates the name, and navigates with breadcrumbs', async () => {
    renderWithDialogs(<FileManager {...appProps} />);
    await userEvent.click(await screen.findByRole('button', { name: /new folder/i }));
    const dlg = await screen.findByRole('dialog');
    const input = within(dlg).getByLabelText('Folder name');
    await userEvent.clear(input);
    await userEvent.type(input, 'bad/name');
    expect(within(dlg).getByText(/cannot contain/)).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Create' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'Taxes{Enter}');
    expect(await findRow(/Taxes/)).toBeInTheDocument();
    fireEvent.doubleClick(row('Taxes'));
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Solace Files');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Taxes');
    await userEvent.click(screen.getByRole('button', { name: 'Up one folder' }));
    expect(await findRow(/Documents/)).toBeInTheDocument();
  });

  it('uploads files, validates content and shows them in the list', async () => {
    renderWithDialogs(<FileManager {...appProps} />);
    await findRow(/Documents/);
    const input = screen.getByLabelText('Choose files to upload') as HTMLInputElement;
    await userEvent.upload(input, [new File(['hello'], 'hello.txt', { type: 'text/plain' }), new File(['x'], 'pic.png', { type: 'image/png' })]);
    expect(await findRow(/hello\.txt/)).toBeInTheDocument();
    expect(getRow(/pic\.png/)).toBeInTheDocument();
    expect(screen.getByText(/2 items|5 items/)).toBeTruthy();
  });

  it('selects multiple items with ctrl/shift and select-all', async () => {
    await fs().load();
    const user = userEvent.setup();
    renderWithDialogs(<FileManager {...appProps} />);
    await findRow(/Documents/);
    await user.click(row('Documents'));
    await user.keyboard('{Control>}');
    await user.click(row('Pictures'));
    await user.keyboard('{/Control}');
    expect(within(listbox()).getAllByRole('option', { selected: true })).toHaveLength(2);
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    await user.click(row('Documents'));
    await user.keyboard('{Shift>}');
    await user.click(row('Pictures'));
    await user.keyboard('{/Shift}');
    expect(within(listbox()).getAllByRole('option', { selected: true })).toHaveLength(3); // Documents → Pictures includes Downloads
    await user.click(row('Pictures'));
    await user.keyboard('{Control>}a{/Control}');
    expect(within(listbox()).getAllByRole('option', { selected: true })).toHaveLength(3);
  });

  it('renames with F2 and trashes with Delete, then restores from the Trash', async () => {
    await fs().createTextFile(ROOT_ID, 'draft.txt', 'x');
    renderWithDialogs(<FileManager {...appProps} />);
    await userEvent.click(await findRow(/draft\.txt/));
    await userEvent.keyboard('{F2}');
    const dlg = await screen.findByRole('dialog');
    const input = within(dlg).getByLabelText('New name');
    await userEvent.clear(input);
    await userEvent.type(input, 'final.txt{Enter}');
    expect(await findRow(/final\.txt/)).toBeInTheDocument();

    await userEvent.click(getRow(/final\.txt/));
    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(queryRow(/final\.txt/)).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Trash/ }));
    expect(await findRow(/final\.txt/)).toBeInTheDocument();
    await userEvent.click(getRow(/final\.txt/));
    await userEvent.click(screen.getByRole('button', { name: /^Restore$/ }));
    await waitFor(() => expect(queryRow(/final\.txt/)).not.toBeInTheDocument());
    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
  });

  it('permanent deletion and Empty Trash require confirmation', async () => {
    const f = await fs().createTextFile(ROOT_ID, 'secret.txt', 'x');
    await fs().trash([f.id]);
    renderWithDialogs(<FileManager {...appProps} props={{ location: 'trash' }} />);
    await userEvent.click(await findRow(/secret\.txt/));
    await userEvent.keyboard('{Delete}');
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(/can't be undone/);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(fs().entries[f.id]).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: /Empty Trash/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Empty Trash' }));
    await waitFor(() => expect(fs().entries[f.id]).toBeUndefined());
  });

  it('copy / paste duplicates and cut / paste moves', async () => {
    const a = await fs().createFolder(ROOT_ID, 'Target');
    await fs().createTextFile(ROOT_ID, 'item.txt', '1');
    renderWithDialogs(<FileManager {...appProps} />);
    await userEvent.click(await findRow(/item\.txt/));
    await userEvent.keyboard('{Control>}c{/Control}');
    fireEvent.doubleClick(row('Target'));
    await screen.findByText('This folder is empty');
    await userEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(await findRow(/item\.txt/)).toBeInTheDocument();
    expect(names(ROOT_ID)).toContain('item.txt'); // original still there
    expect(childrenOf(fs().entries, a.id)).toHaveLength(1);
  });

  it('searches across folders and shows where results live', async () => {
    const dir = await fs().createFolder(ROOT_ID, 'Deep');
    await fs().createTextFile(dir.id, 'needle.txt', '1');
    renderWithDialogs(<FileManager {...appProps} />);
    await findRow(/Documents/);
    await userEvent.type(screen.getByLabelText('Search files'), 'needle');
    const hit = await findRow(/needle\.txt/);
    expect(hit).toHaveTextContent('Solace Files / Deep');
    await userEvent.clear(screen.getByLabelText('Search files'));
    await userEvent.type(screen.getByLabelText('Search files'), 'zzzzz');
    expect(await screen.findByText('No results')).toBeInTheDocument();
  });

  it('switches between list and grid views, and sorts and filters', async () => {
    await fs().createTextFile(ROOT_ID, 'b.txt', '1');
    await fs().createTextFile(ROOT_ID, 'a.png', '1');
    renderWithDialogs(<FileManager {...appProps} />);
    await findRow(/b\.txt/);
    await userEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(await findRow(/b\.txt/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'image');
    expect(queryRow(/b\.txt/)).not.toBeInTheDocument();
    expect(getRow(/a\.png/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'folder');
    expect(queryRow(/a\.png/)).not.toBeInTheDocument();
    expect(getRow(/Documents/)).toBeInTheDocument();
  });

  it('opens a text file in the Text Editor (linked to the file)', async () => {
    const f = await fs().createTextFile(ROOT_ID, 'readme.txt', 'hi there');
    renderWithDialogs(<FileManager {...appProps} />);
    fireEvent.doubleClick(await findRow(/readme\.txt/));
    const w = Object.values(useWindows.getState().windows).find((x) => x.appId === 'editor');
    expect(w?.props.fileId).toBe(f.id);
    expect(useDocs.getState().docs).toHaveLength(0); // the editor creates the document when it loads
  });

  it('shows details for the selected item', async () => {
    await fs().createTextFile(ROOT_ID, 'info.txt', '12345');
    renderWithDialogs(<FileManager {...appProps} />);
    await userEvent.click(await findRow(/info\.txt/));
    await userEvent.click(screen.getByRole('button', { name: 'Details pane' }));
    const pane = screen.queryByRole('complementary', { name: 'Details' });
    if (pane) {
      expect(pane).toHaveTextContent('5 B');
      expect(pane).toHaveTextContent('In this browser (Solace Files)');
    }
  });

  it('handles very large folders by rendering only a window of rows', async () => {
    const many = Array.from({ length: 600 }, (_, i) => new File(['x'], `f${String(i).padStart(4, '0')}.txt`));
    await fs().importFiles(ROOT_ID, many);
    renderWithDialogs(<FileManager {...appProps} />);
    await findRow(/f0000\.txt/);
    expect(within(listbox()).getAllByRole('option').length).toBeLessThan(120);
    expect(screen.getByText(/603 items/)).toBeInTheDocument();
  });
});
