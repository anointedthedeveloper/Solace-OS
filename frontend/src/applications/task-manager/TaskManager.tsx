import { useMemo, useState } from 'react';
import { CalendarDays, CheckCheck, ListChecks, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { AppComponentProps } from '../types';
import { useTasks, type Priority, type Task } from '@/stores/tasksStore';
import { confirmDialog } from '@/stores/uiStore';
import { notify } from '@/stores/notificationStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { VirtualList } from '@/components/ui/VirtualList';
import { cn } from '@/utils/cn';
import { dueLabel, filterTasks, type TaskFilter, type TaskSort } from './logic';

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'done', label: 'Completed' },
];
const PRIORITY_COLOR: Record<Priority, string> = { high: 'var(--s-danger)', medium: 'var(--s-warn)', low: 'var(--s-text-faint)' };

function TaskForm({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [details, setDetails] = useState(task?.details ?? '');
  const [due, setDue] = useState(task?.due ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const valid = title.trim().length > 0;
  const save = () => {
    if (!valid) return;
    const patch = { title: title.trim(), details, due: due || null, priority };
    if (task) useTasks.getState().update(task.id, patch);
    else useTasks.getState().add(patch);
    onClose();
  };
  return (
    <Modal
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="s-btn" onClick={onClose}>Cancel</button>
          <button className="s-btn s-btn-primary" disabled={!valid} onClick={save}>{task ? 'Save' : 'Add task'}</button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div>
          <label className="mb-1 block text-[12.5px]" htmlFor="task-title">Title</label>
          <input id="task-title" data-autofocus className="s-input w-full" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px]" htmlFor="task-details">Details</label>
          <textarea id="task-details" className="s-input w-full" rows={3} value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12.5px]" htmlFor="task-due">Due date</label>
            <input id="task-due" type="date" className="s-input w-full" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px]" htmlFor="task-priority">Priority</label>
            <select id="task-priority" className="s-input w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function TaskRow({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const { toggle, remove } = useTasks.getState();
  const due = dueLabel(task.due);
  return (
    <div className="group flex h-full items-center gap-3 border-b border-line px-3 hover:bg-surface3" data-testid="task-row">
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--s-accent)]" checked={task.done} onChange={() => toggle(task.id)} aria-label={`${task.done ? 'Mark incomplete' : 'Complete'}: ${task.title}`} />
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[task.priority] }} title={`${task.priority} priority`} aria-label={`${task.priority} priority`} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13.5px]', task.done ? 'text-faint line-through' : 'text-ink')}>{task.title}</div>
        {task.details && <div className="truncate text-[12px] text-dim">{task.details}</div>}
      </div>
      {due && (
        <span className={cn('flex shrink-0 items-center gap-1 text-[12px]', due.overdue && !task.done ? 'text-danger' : 'text-dim')}>
          <CalendarDays size={12} aria-hidden /> {due.text}
        </span>
      )}
      <div className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <button className="s-icon-btn" aria-label={`Edit ${task.title}`} title="Edit" onClick={onEdit}><Pencil size={14} /></button>
        <button
          className="s-icon-btn hover:!text-danger"
          aria-label={`Delete ${task.title}`}
          title="Delete"
          onClick={async () => {
            if (await confirmDialog({ title: 'Delete task?', message: `“${task.title}” will be deleted.`, confirmLabel: 'Delete', danger: true })) remove(task.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function TaskManager(_props: AppComponentProps) {
  const tasks = useTasks((s) => s.tasks);
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [priority, setPriority] = useState<Priority | 'any'>('any');
  const [sort, setSort] = useState<TaskSort>('due');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);

  const list = useMemo(() => filterTasks(tasks, { filter, priority, query, sort }), [tasks, filter, priority, query, sort]);
  const doneCount = tasks.filter((t) => t.done).length;
  const openCount = tasks.length - doneCount;

  const quickAdd = () => {
    if (!quick.trim()) return;
    useTasks.getState().add({ title: quick });
    setQuick('');
    if (filter === 'done') setFilter('open');
  };

  return (
    <div className="flex h-full flex-col">
      <form className="flex items-center gap-2 border-b border-line p-2.5" onSubmit={(e) => { e.preventDefault(); quickAdd(); }}>
        <input className="s-input min-w-0 flex-1" placeholder="Add a task and press Enter" aria-label="New task title" value={quick} maxLength={200} onChange={(e) => setQuick(e.target.value)} />
        <button type="submit" className="s-btn s-btn-primary" disabled={!quick.trim()}><Plus size={15} /> Add</button>
        <button type="button" className="s-btn" onClick={() => setEditing('new')}>Add with details…</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-2.5 py-2">
        <div role="tablist" aria-label="Filter tasks" className="flex gap-0.5">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn('rounded-[var(--s-radius-sm)] px-2.5 py-1 text-[12.5px]', filter === f.id ? 'bg-accentsoft font-medium text-ink' : 'text-dim hover:bg-surface3')}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-faint" aria-hidden />
            <input className="s-input w-36 !pl-7" placeholder="Search" aria-label="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="s-input" aria-label="Priority filter" value={priority} onChange={(e) => setPriority(e.target.value as Priority | 'any')}>
            <option value="any">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="s-input" aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value as TaskSort)}>
            <option value="due">Sort: due date</option>
            <option value="priority">Sort: priority</option>
            <option value="created">Sort: newest</option>
          </select>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {list.length === 0 ? (
          <EmptyState
            icon={tasks.length === 0 ? ListChecks : CheckCheck}
            title={tasks.length === 0 ? 'No tasks yet' : query || priority !== 'any' ? 'No matching tasks' : filter === 'done' ? 'Nothing completed yet' : 'Nothing here'}
            hint={tasks.length === 0 ? 'Add your first task above.' : query || priority !== 'any' ? 'Try clearing the search or priority filter.' : filter === 'overdue' ? "You're all caught up." : undefined}
          />
        ) : (
          <VirtualList className="h-full" items={list} rowHeight={52} getKey={(t) => t.id} label="Tasks" renderRow={(t) => <TaskRow task={t} onEdit={() => setEditing(t)} />} />
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[12px] text-dim">
        <span>{openCount} open · {doneCount} completed</span>
        <button
          className="s-btn s-btn-ghost !h-6 !px-2 text-[12px]"
          disabled={doneCount === 0}
          onClick={async () => {
            if (await confirmDialog({ title: 'Clear completed tasks?', message: `${doneCount} completed task${doneCount === 1 ? '' : 's'} will be permanently deleted.`, confirmLabel: 'Clear completed', danger: true })) {
              const n = useTasks.getState().clearCompleted();
              notify({ title: 'Completed tasks cleared', body: `${n} task${n === 1 ? '' : 's'} removed.`, appId: 'tasks' });
            }
          }}
        >
          Clear completed
        </button>
      </div>
      {editing && <TaskForm task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
