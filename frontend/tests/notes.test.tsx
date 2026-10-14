import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Notes, { filterNotes } from '@/applications/notes/Notes';
import { useNotes, type Note } from '@/stores/notesStore';
import { appProps, renderWithDialogs, resetAll } from './helpers';

const note = (over: Partial<Note>): Note => ({ id: Math.random().toString(36), title: '', content: '', createdAt: 1, updatedAt: 1, pinned: false, archived: false, ...over });

describe('notes', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('shows an empty state with a call to action', () => {
    renderWithDialogs(<Notes {...appProps} />);
    expect(screen.getByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByText('Select a note')).toBeInTheDocument();
  });

  it('creates a note and edits its title and content, saving as you type', async () => {
    renderWithDialogs(<Notes {...appProps} />);
    await userEvent.click(screen.getAllByRole('button', { name: /new note/i })[0]);
    await userEvent.type(screen.getByLabelText('Note title'), 'Groceries');
    await userEvent.type(screen.getByLabelText('Note content'), 'milk eggs bread');
    const [saved] = useNotes.getState().notes;
    expect(saved.title).toBe('Groceries');
    expect(saved.content).toBe('milk eggs bread');
    expect(screen.getByText(/3 words/)).toBeInTheDocument();
    expect(screen.getByText(/Saved · edited/)).toBeInTheDocument();
  });

  it('searches titles and content', async () => {
    useNotes.setState({ notes: [note({ id: 'a', title: 'Recipe', content: 'pasta' }), note({ id: 'b', title: 'Todo', content: 'call bob' })] });
    renderWithDialogs(<Notes {...appProps} />);
    await userEvent.type(screen.getByLabelText('Search notes'), 'bob');
    const list = screen.getByRole('list', { name: 'Notes' });
    expect(within(list).getByText('Todo')).toBeInTheDocument();
    expect(within(list).queryByText('Recipe')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search notes'));
    await userEvent.type(screen.getByLabelText('Search notes'), 'zzz');
    expect(screen.getByText('No matching notes')).toBeInTheDocument();
  });

  it('pins notes to the top and archives / restores them', async () => {
    useNotes.setState({ notes: [note({ id: 'a', title: 'Alpha', updatedAt: 5 }), note({ id: 'b', title: 'Beta', updatedAt: 9 })] });
    renderWithDialogs(<Notes {...appProps} />);
    const list = screen.getByRole('list', { name: 'Notes' });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Beta');
    await userEvent.click(within(list).getByText('Alpha'));
    await userEvent.click(screen.getByRole('button', { name: 'Pin note' }));
    expect(useNotes.getState().notes.find((n) => n.id === 'a')!.pinned).toBe(true);
    expect(within(screen.getByRole('list', { name: 'Notes' })).getAllByRole('listitem')[0]).toHaveTextContent('Alpha');

    await userEvent.click(screen.getByRole('button', { name: 'Archive note' }));
    expect(useNotes.getState().notes.find((n) => n.id === 'a')).toMatchObject({ archived: true, pinned: false });
    await userEvent.click(screen.getByRole('radio', { name: 'Archived' }));
    expect(within(screen.getByRole('list', { name: 'Notes' })).getByText('Alpha')).toBeInTheDocument();
  });

  it('only deletes after confirmation', async () => {
    useNotes.setState({ notes: [note({ id: 'a', title: 'Keep me' })] });
    renderWithDialogs(<Notes {...appProps} />);
    await userEvent.click(screen.getByText('Keep me'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(useNotes.getState().notes).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(useNotes.getState().notes).toHaveLength(0);
  });

  it('filterNotes orders pinned first, then newest', () => {
    const out = filterNotes([note({ id: '1', updatedAt: 1 }), note({ id: '2', updatedAt: 3 }), note({ id: '3', updatedAt: 2, pinned: true })], 'active', '');
    expect(out.map((n) => n.id)).toEqual(['3', '2', '1']);
  });
});
