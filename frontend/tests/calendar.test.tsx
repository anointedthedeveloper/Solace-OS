import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Calendar from '@/applications/calendar/Calendar';
import { defaultDraft, draftFromEvent, draftToInput, formatEventTime } from '@/applications/calendar/logic';
import { eventsOnDay, useEvents } from '@/stores/eventsStore';
import { monthGrid, sameDay } from '@/utils/calendar';
import { toDateKey } from '@/utils/format';
import { appProps, renderWithDialogs, resetAll } from './helpers';

describe('calendar logic', () => {
  it('builds a 6x7 Monday-first month grid', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g).toHaveLength(42);
    expect(g[0].getDay()).toBe(1);
    expect(g.some((d) => d.getMonth() === 9 && d.getDate() === 1)).toBe(true);
    expect(g[3]).toEqual(new Date(2026, 9, 1));
  });

  it('validates event drafts', () => {
    const base = { ...defaultDraft(new Date(2026, 5, 10)), title: 'Standup' };
    expect(draftToInput({ ...base, title: '  ' })).toMatchObject({ ok: false });
    expect(draftToInput({ ...base, endTime: '08:00' })).toMatchObject({ ok: false, error: expect.stringMatching(/end must be after/i) });
    expect(draftToInput({ ...base, endTime: '09:00' })).toMatchObject({ ok: false }); // zero length
    expect(draftToInput({ ...base, startDate: '' })).toMatchObject({ ok: false });
    const ok = draftToInput(base);
    expect(ok).toMatchObject({ ok: true });
    if (ok.ok) {
      expect(ok.value.end - ok.value.start).toBe(3_600_000);
      expect(ok.value.title).toBe('Standup');
    }
  });

  it('handles all-day events and multi-day spans', () => {
    const d = { ...defaultDraft(new Date(2026, 5, 10)), title: 'Trip', allDay: true, endDate: '2026-06-12' };
    const r = draftToInput(d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ev = { ...r.value, id: '1' };
      expect(eventsOnDay([ev], new Date(2026, 5, 10))).toHaveLength(1);
      expect(eventsOnDay([ev], new Date(2026, 5, 12))).toHaveLength(1);
      expect(eventsOnDay([ev], new Date(2026, 5, 13))).toHaveLength(0);
      expect(formatEventTime(ev)).toBe('All day');
      expect(draftFromEvent(ev)).toMatchObject({ allDay: true, startDate: '2026-06-10', endDate: '2026-06-12' });
    }
  });

  it('eventsOnDay places timed events on the right local day, all-day first', () => {
    const at = (h: number) => new Date(2026, 5, 10, h).getTime();
    const evs = [
      { id: 'a', title: 'Late', start: at(20), end: at(21), allDay: false, location: '', description: '' },
      { id: 'b', title: 'Early', start: at(8), end: at(9), allDay: false, location: '', description: '' },
      { id: 'c', title: 'Holiday', start: new Date(2026, 5, 10).getTime(), end: new Date(2026, 5, 10).getTime(), allDay: true, location: '', description: '' },
    ];
    expect(eventsOnDay(evs, new Date(2026, 5, 10)).map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(eventsOnDay(evs, new Date(2026, 5, 11))).toHaveLength(0);
  });
});

describe('Calendar app', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('marks the current date and renders the month grid', () => {
    renderWithDialogs(<Calendar {...appProps} />);
    const today = screen.getByRole('gridcell', { current: 'date' });
    expect(today).toHaveAttribute('aria-label', expect.stringContaining(String(new Date().getFullYear())));
    expect(within(today).getByText(String(new Date().getDate()))).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    expect(screen.getByText(/don't sync with any online calendar/)).toBeInTheDocument();
  });

  it('navigates months and returns to today', async () => {
    renderWithDialogs(<Calendar {...appProps} />);
    const heading = screen.getByRole('heading', { level: 2 });
    const now = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    expect(heading).toHaveTextContent(now);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(heading).not.toHaveTextContent(now);
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(heading).not.toHaveTextContent(now);
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(heading).toHaveTextContent(now);
  });

  it('creates an event, persists it and shows it on the grid', async () => {
    renderWithDialogs(<Calendar {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: /new event/i }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Title'), 'Dentist');
    await userEvent.type(within(dlg).getByLabelText('Location'), 'Main St');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(useEvents.getState().events).toHaveLength(1);
    expect(useEvents.getState().events[0]).toMatchObject({ title: 'Dentist', location: 'Main St', allDay: false });
    expect(screen.getByRole('button', { name: /Dentist/ })).toBeInTheDocument();
  });

  it('rejects an event that ends before it starts, with a clear message', async () => {
    renderWithDialogs(<Calendar {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: /new event/i }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Title'), 'Bad');
    await userEvent.clear(within(dlg).getByLabelText('End time'));
    await userEvent.type(within(dlg).getByLabelText('End time'), '07:00');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(within(dlg).getByRole('alert')).toHaveTextContent(/end must be after the start/i);
    expect(useEvents.getState().events).toHaveLength(0);
  });

  it('edits an event', async () => {
    const start = new Date(); start.setHours(10, 0, 0, 0);
    useEvents.setState({ events: [{ id: 'e1', title: 'Lunch', start: start.getTime(), end: start.getTime() + 3_600_000, allDay: false, location: '', description: '' }] });
    renderWithDialogs(<Calendar {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Lunch/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit event' });
    const title = within(dlg).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Brunch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(useEvents.getState().events[0].title).toBe('Brunch');
  });

  it('deletes an event only after confirmation', async () => {
    const start = new Date(); start.setHours(10, 0, 0, 0);
    useEvents.setState({ events: [{ id: 'e1', title: 'Gym', start: start.getTime(), end: start.getTime() + 3_600_000, allDay: false, location: '', description: '' }] });
    renderWithDialogs(<Calendar {...appProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Gym/ }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Edit event' })).getByRole('button', { name: /Delete/ }));
    const confirm = await screen.findByRole('alertdialog');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(useEvents.getState().events).toHaveLength(1);
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit event' })).getByRole('button', { name: /Delete/ }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(useEvents.getState().events).toHaveLength(0);
  });

  it('agenda view groups upcoming events by day, with an empty state', async () => {
    renderWithDialogs(<Calendar {...appProps} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Agenda' }));
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(15, 0, 0, 0);
    useEvents.getState().add({ title: 'Review', start: tomorrow.getTime(), end: tomorrow.getTime() + 1_800_000, allDay: false, location: 'Room 4', description: '' });
    expect(await screen.findByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Room 4')).toBeInTheDocument();
  });

  it('supports arrow-key navigation across days', async () => {
    renderWithDialogs(<Calendar {...appProps} />);
    const today = screen.getByRole('gridcell', { current: 'date' });
    today.focus();
    await userEvent.keyboard('{ArrowRight}');
    const sel = screen.getAllByRole('gridcell', { selected: true });
    expect(sel).toHaveLength(1);
    expect(sameDay(new Date(), new Date())).toBe(true);
    expect(sel[0]).not.toBe(today);
    expect(toDateKey(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
