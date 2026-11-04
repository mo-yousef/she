import { localDateKey, minutesOfDayInZone, weekdayInZone, BUSINESS_TZ } from './time';
/**
 * Opening-hours validation (task 6.1; the full editor in 6.6 extends this, it does not
 * replace it). Pure: used by the onboarding save core and, later, the hours editor.
 * Minutes are counted from local (Europe/Nicosia) midnight; weekday 0 = Sunday.
 */

export interface DayHours {
  weekday: number;
  closed: boolean;
  opensMin: number;
  closesMin: number;
}

export type HoursErrorCode = 'weekdays' | 'range' | 'closeBeforeOpen' | 'allClosed';
export interface HoursError {
  /** The offending weekday, or null for a whole-week problem. */
  weekday: number | null;
  code: HoursErrorCode;
}

/** Display order: Monday first. Values are the stored weekday numbers. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function validateWeek(
  days: DayHours[],
): { ok: true; days: DayHours[] } | { ok: false; errors: HoursError[] } {
  const errors: HoursError[] = [];
  const seen = new Set(days.map((d) => d.weekday));
  if (days.length !== 7 || seen.size !== 7 || [...seen].some((w) => !Number.isInteger(w) || w < 0 || w > 6)) {
    return { ok: false, errors: [{ weekday: null, code: 'weekdays' }] };
  }
  const clean = days.map((d): DayHours => {
    if (d.closed) return { weekday: d.weekday, closed: true, opensMin: 0, closesMin: 0 };
    if (
      !Number.isInteger(d.opensMin) ||
      !Number.isInteger(d.closesMin) ||
      d.opensMin < 0 ||
      d.opensMin > 1440 ||
      d.closesMin < 0 ||
      d.closesMin > 1440
    ) {
      errors.push({ weekday: d.weekday, code: 'range' });
    } else if (d.closesMin <= d.opensMin) {
      errors.push({ weekday: d.weekday, code: 'closeBeforeOpen' });
    }
    return { ...d };
  });
  // A listing with every day closed has no hours at all.
  if (errors.length === 0 && clean.every((d) => d.closed)) {
    errors.push({ weekday: null, code: 'allClosed' });
  }
  return errors.length ? { ok: false, errors } : { ok: true, days: clean };
}

/** "09:30" -> 570. Returns null for anything that is not HH:MM (24:00 allowed as end of day). */
export function parseTimeOfDay(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** 570 -> "09:30". 1440 -> "24:00". */
export function formatTimeOfDay(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Same window on every OTHER day (closed state included); the source row is untouched. */
export function copyToAllDays(days: ReadonlyArray<DayHours>, from: number): DayHours[] {
  const src = days.find((d) => d.weekday === from);
  if (!src) return [...days];
  return days.map((d) => (d.weekday === from ? d : { ...d, closed: src.closed, opensMin: src.opensMin, closesMin: src.closesMin }));
}
const CLOSED = (weekday: number): DayHours => ({ weekday, closed: true, opensMin: 0, closesMin: 0 });
/**
 * Fits a staff override into new business hours (task 6.6). The engine uses a staff window
 * ALONE, so it must never be wider than the business window: per weekday the result is the
 * intersection, and a day becomes closed when the business is closed or the intersection is
 * empty. Days that already fit are returned unchanged (same values).
 */
export function clampStaffHours(staffDays: ReadonlyArray<DayHours>, businessDays: ReadonlyArray<DayHours>): DayHours[] {
  return staffDays.map((d) => {
    if (d.closed) return { ...d };
    const b = businessDays.find((x) => x.weekday === d.weekday);
    if (!b || b.closed) return CLOSED(d.weekday);
    const opensMin = Math.max(d.opensMin, b.opensMin);
    const closesMin = Math.min(d.closesMin, b.closesMin);
    return closesMin > opensMin ? { weekday: d.weekday, closed: false, opensMin, closesMin } : CLOSED(d.weekday);
  });
}
/** Stable text key of a week, for "did it change" checks. */
export function weekKey(days: ReadonlyArray<DayHours>): string {
  return [...days]
    .sort((a, b) => a.weekday - b.weekday)
    .map((d) => (d.closed ? `${d.weekday}:x` : `${d.weekday}:${d.opensMin}-${d.closesMin}`))
    .join(',');
}
/**
 * Is the business open at `now`? Weekly hours in Europe/Nicosia, and false on any closure
 * day (inclusive local 'YYYY-MM-DD' ranges). The single definition used by search, the
 * public page badge and the tests.
 */
export function isOpenNow(
  hours: ReadonlyArray<DayHours>,
  closures: ReadonlyArray<{ from: string; to: string }>,
  now: Date,
): boolean {
  const key = localDateKey(now, BUSINESS_TZ);
  if (closures.some((c) => key >= c.from && key <= c.to)) return false;
  const today = hours.find((h) => h.weekday === weekdayInZone(now, BUSINESS_TZ));
  if (!today || today.closed) return false;
  const minutes = minutesOfDayInZone(now, BUSINESS_TZ);
  return minutes >= today.opensMin && minutes < today.closesMin;
}
/**
 * How many bookings do not fit the given week (their local weekday is closed, or they start
 * before opening / end after closing). A booking that ends on a later local day counts
 * minutes past midnight, so ending exactly at local midnight fits a 24:00 close.
 */
export function countOutsideHours(bookings: ReadonlyArray<{ startsAt: Date; endsAt: Date }>, week: ReadonlyArray<DayHours>): number {
  let n = 0;
  for (const b of bookings) {
    const day = week.find((d) => d.weekday === weekdayInZone(b.startsAt, BUSINESS_TZ));
    const start = minutesOfDayInZone(b.startsAt, BUSINESS_TZ);
    const sameDay = localDateKey(b.startsAt, BUSINESS_TZ) === localDateKey(b.endsAt, BUSINESS_TZ);
    const end = sameDay ? minutesOfDayInZone(b.endsAt, BUSINESS_TZ) : 1440 + minutesOfDayInZone(b.endsAt, BUSINESS_TZ);
    if (!day || day.closed || start < day.opensMin || end > day.closesMin) n++;
  }
  return n;
}
