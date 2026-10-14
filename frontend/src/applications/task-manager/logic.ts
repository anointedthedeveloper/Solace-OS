import type { Priority, Task } from '@/stores/tasksStore';
import { toDateKey } from '@/utils/format';

export type TaskFilter = 'all' | 'open' | 'today' | 'overdue' | 'done';
export type TaskSort = 'due' | 'priority' | 'created';

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function filterTasks(tasks: Task[], opts: { filter: TaskFilter; priority: Priority | 'any'; query: string; sort: TaskSort; today?: string }): Task[] {
  const today = opts.today ?? toDateKey(new Date());
  const q = opts.query.trim().toLowerCase();
  return tasks
    .filter((t) => {
      switch (opts.filter) {
        case 'open':
          return !t.done;
        case 'today':
          return !t.done && t.due === today;
        case 'overdue':
          return !t.done && !!t.due && t.due < today;
        case 'done':
          return t.done;
        default:
          return true;
      }
    })
    .filter((t) => opts.priority === 'any' || t.priority === opts.priority)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.details.toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1; // completed always sink
      if (opts.sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999');
      if (opts.sort === 'created') return b.createdAt - a.createdAt;
      return (a.due ?? '9999').localeCompare(b.due ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
}

export function dueLabel(due: string | null, today = toDateKey(new Date())): { text: string; overdue: boolean } | null {
  if (!due) return null;
  if (due === today) return { text: 'Today', overdue: false };
  const [y, m, d] = due.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const t = new Date(today + 'T00:00:00');
  const diff = Math.round((date.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return { text: 'Tomorrow', overdue: false };
  if (diff === -1) return { text: 'Yesterday', overdue: true };
  return { text: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), overdue: diff < 0 };
}
