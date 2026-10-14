import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskManager from '@/applications/task-manager/TaskManager';
import { dueLabel, filterTasks } from '@/applications/task-manager/logic';
import { useTasks, type Task } from '@/stores/tasksStore';
import { appProps, renderWithDialogs, resetAll } from './helpers';

const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36), title: 't', details: '', due: null, priority: 'medium', done: false, createdAt: 1, completedAt: null, ...over });

describe('task logic', () => {
  const today = '2026-03-10';
  const tasks = [
    task({ id: 'a', title: 'Pay rent', due: '2026-03-01', priority: 'high' }),
    task({ id: 'b', title: 'Write report', due: today, priority: 'medium' }),
    task({ id: 'c', title: 'Water plants', due: '2026-03-20', priority: 'low' }),
    task({ id: 'd', title: 'Old thing', done: true, completedAt: 5 }),
    task({ id: 'e', title: 'Someday' }),
  ];
  const f = (o: Partial<Parameters<typeof filterTasks>[1]>) => filterTasks(tasks, { filter: 'all', priority: 'any', query: '', sort: 'due', today, ...o }).map((t) => t.id);

  it('filters by status', () => {
    expect(f({ filter: 'open' })).toEqual(['a', 'b', 'c', 'e']);
    expect(f({ filter: 'today' })).toEqual(['b']);
    expect(f({ filter: 'overdue' })).toEqual(['a']);
    expect(f({ filter: 'done' })).toEqual(['d']);
  });
  it('filters by priority and search text', () => {
    expect(f({ priority: 'high' })).toEqual(['a']);
    expect(f({ query: 'PLANT' })).toEqual(['c']);
  });
  it('sorts by due date with undated last and completed at the bottom', () => {
    expect(f({})).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
  it('sorts by priority', () => {
    expect(f({ sort: 'priority' }).slice(0, 4)).toEqual(['a', 'b', 'e', 'c']);
  });
  it('labels due dates', () => {
    expect(dueLabel('2026-03-10', today)).toEqual({ text: 'Today', overdue: false });
    expect(dueLabel('2026-03-11', today)).toEqual({ text: 'Tomorrow', overdue: false });
    expect(dueLabel('2026-03-09', today)).toEqual({ text: 'Yesterday', overdue: true });
    expect(dueLabel('2026-02-01', today)?.overdue).toBe(true);
    expect(dueLabel(null, today)).toBeNull();
  });
});

describe('Task Manager app', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('shows an empty state', () => {
    renderWithDialogs(<TaskManager {...appProps} />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('adds a task from the quick-add field', async () => {
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.type(screen.getByLabelText('New task title'), 'Buy milk{Enter}');
    expect(useTasks.getState().tasks[0]).toMatchObject({ title: 'Buy milk', done: false, priority: 'medium' });
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByLabelText('New task title')).toHaveValue('');
  });

  it('does not add blank tasks', async () => {
    renderWithDialogs(<TaskManager {...appProps} />);
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('New task title'), '   {Enter}');
    expect(useTasks.getState().tasks).toHaveLength(0);
  });

  it('creates a task with details, due date and priority', async () => {
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: /add with details/i }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Title'), 'File taxes');
    await userEvent.type(within(dlg).getByLabelText('Details'), 'Gather receipts');
    await userEvent.type(within(dlg).getByLabelText('Due date'), '2030-04-15');
    await userEvent.selectOptions(within(dlg).getByLabelText('Priority'), 'high');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add task' }));
    expect(useTasks.getState().tasks[0]).toMatchObject({ title: 'File taxes', details: 'Gather receipts', due: '2030-04-15', priority: 'high' });
  });

  it('edits an existing task', async () => {
    useTasks.setState({ tasks: [task({ id: 'x', title: 'Old title' })] });
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Old title' }));
    const dlg = await screen.findByRole('dialog');
    const title = within(dlg).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'New title');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(useTasks.getState().tasks[0].title).toBe('New title');
  });

  it('completes a task, which moves it to the Completed filter', async () => {
    useTasks.setState({ tasks: [task({ id: 'x', title: 'Do it' })] });
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /complete: do it/i }));
    expect(useTasks.getState().tasks[0]).toMatchObject({ done: true });
    expect(useTasks.getState().tasks[0].completedAt).toBeTypeOf('number');
    expect(screen.queryByText('Do it')).not.toBeInTheDocument(); // default filter is "Open"
    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }));
    expect(screen.getByText('Do it')).toBeInTheDocument();
  });

  it('deletes only after confirmation', async () => {
    useTasks.setState({ tasks: [task({ id: 'x', title: 'Delete me' })] });
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Delete me' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(useTasks.getState().tasks).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Delete me' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(useTasks.getState().tasks).toHaveLength(0);
  });

  it('clears completed tasks after confirmation', async () => {
    useTasks.setState({ tasks: [task({ id: 'a', title: 'A', done: true }), task({ id: 'b', title: 'B' })] });
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear completed' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear completed' }));
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('searches and shows a no-results state', async () => {
    useTasks.setState({ tasks: [task({ id: 'a', title: 'Alpha' })] });
    renderWithDialogs(<TaskManager {...appProps} />);
    await userEvent.type(screen.getByLabelText('Search tasks'), 'zzz');
    expect(screen.getByText('No matching tasks')).toBeInTheDocument();
  });
});
