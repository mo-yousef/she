/**
 * URL state of the dashboard calendar (task 6.2): `?view=day|week&date=YYYY-MM-DD&staff=<id|all>`.
 * Pure. Invalid values are dropped (fall back to defaults), never thrown.
 */
import { addDaysToKey, weekdayInZone, zonedWallTimeToUtc } from './time';

export type CalendarView = 'day' | 'week';

/** True for a real calendar date written as 'YYYY-MM-DD' (rejects 2026-02-30). */
export function isDateKey(v: unknown): v is string {
  return (
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDaysToKey(v, 0) === v
  );
}

/** Monday of the week containing `dateKey` (Cyprus weeks start on Monday). */
export function weekStartKey(dateKey: string): string {
  const wd = weekdayInZone(zonedWallTimeToUtc(dateKey, 0)); // 0 = Sunday
  return addDaysToKey(dateKey, -((wd + 6) % 7));
}

export interface CalendarParams {
  view: CalendarView;
  dateKey: string;
  /** Specific staff id, or null for "all staff" (day view) / the first staff (week view). */
  staffId: string | null;
  showCancelled: boolean;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseCalendarParams(raw: Raw, todayKey: string): CalendarParams {
  const date = one(raw.date);
  const staff = one(raw.staff);
  return {
    view: one(raw.view) === 'week' ? 'week' : 'day',
    dateKey: isDateKey(date) ? date : todayKey,
    staffId: staff && staff !== 'all' && staff.length <= 40 ? staff : null,
    showCancelled: one(raw.cancelled) === '1',
  };
}

/** Query string for a calendar URL; defaults are omitted to keep links short. */
export function calendarQuery(p: Partial<CalendarParams> & { dateKey: string }): string {
  const q = new URLSearchParams();
  if (p.view === 'week') q.set('view', 'week');
  q.set('date', p.dateKey);
  if (p.staffId) q.set('staff', p.staffId);
  if (p.showCancelled) q.set('cancelled', '1');
  return q.toString();
}

/** The date keys shown: one for day view, Monday..Sunday for week view. */
export function visibleDateKeys(view: CalendarView, dateKey: string): string[] {
  if (view === 'day') return [dateKey];
  const start = weekStartKey(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
}

/** Previous / next page of the same size (1 day or 7 days). */
export function shiftDateKey(
  view: CalendarView,
  dateKey: string,
  direction: 1 | -1,
): string {
  return addDaysToKey(dateKey, direction * (view === 'week' ? 7 : 1));
}
