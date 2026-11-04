/**
 * Team CRUD input schema + pure rules (task 6.5, req 5.1). No DB / Next imports so it is
 * unit-testable and shared by the server core and the client form.
 *
 * Decisions (docs/decisions.md):
 *  - name 2..60, role/title 1..60 (empty -> "Specialist").
 *  - `hours` is null (inherit business hours: no StaffHours rows) or all 7 weekdays (the
 *    engine treats a missing weekday as "not working", so a partial set is never written).
 *  - the engine uses a staff window ALONE (it does not intersect with business hours), so
 *    the server requires every custom day to lie WITHIN that weekday's business window and a
 *    business-closed day cannot be open for staff (`outsideBusinessHours`).
 *  - a day-off range: valid dates, to >= from, at most 366 days, not entirely in the past.
 * Messages are i18n key suffixes under `team.validation.*`.
 */
import { z } from 'zod';
import { isDateKey } from './calendar-params';
import { validateWeek, type DayHours } from './hours';
import { addDaysToKey } from './time';
import { serviceFieldErrors, type FieldErrors } from './services-schema';

export const DEFAULT_ROLE = 'Specialist';
export const MAX_DAY_OFF_SPAN_DAYS = 366;
export const MAX_DAY_OFF_RANGES = 200;

export const hoursDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  closed: z.boolean(),
  opensMin: z.number().int().min(0).max(1440),
  closesMin: z.number().int().min(0).max(1440),
});

export const staffInputSchema = z.object({
  name: z.string().trim().min(2, 'nameRequired').max(60, 'nameRequired'),
  role: z
    .string()
    .trim()
    .max(60, 'roleTooLong')
    .optional()
    .transform((v) => v || DEFAULT_ROLE),
  active: z.boolean({ invalid_type_error: 'invalid' }),
  serviceIds: z
    .array(z.string().min(1).max(64))
    .max(200)
    .transform((ids) => [...new Set(ids)]),
  /** null = use business hours. */
  hours: z.array(hoursDaySchema).max(7).nullable(),
});
export type StaffInput = z.infer<typeof staffInputSchema>;

export const staffFieldErrors = serviceFieldErrors;

/** Weekdays whose custom window is not inside the business window for that weekday. */
export function outsideBusinessWeekdays(custom: ReadonlyArray<DayHours>, business: ReadonlyArray<DayHours>): number[] {
  const out: number[] = [];
  for (const d of custom) {
    if (d.closed) continue;
    const b = business.find((x) => x.weekday === d.weekday);
    if (!b || b.closed || d.opensMin < b.opensMin || d.closesMin > b.closesMin) out.push(d.weekday);
  }
  return out;
}

/**
 * Validates the weekly override. Returns the clean 7 rows, or field errors keyed `hours`
 * (whole week) and `hours.<weekday>` (one day). null input -> ok with null (inherit).
 */
export function checkStaffHours(
  hours: ReadonlyArray<DayHours> | null,
  businessHours: ReadonlyArray<DayHours>,
): { ok: true; days: DayHours[] | null } | { ok: false; errors: FieldErrors } {
  if (hours === null) return { ok: true, days: null };
  const week = validateWeek([...hours]);
  if (!week.ok) {
    const errors: FieldErrors = {};
    for (const e of week.errors) errors[e.weekday === null ? 'hours' : `hours.${e.weekday}`] = e.code;
    errors.hours ??= 'invalid';
    return { ok: false, errors };
  }
  const bad = outsideBusinessWeekdays(week.days, businessHours);
  if (bad.length) {
    const errors: FieldErrors = { hours: 'outsideBusinessHours' };
    for (const w of bad) errors[`hours.${w}`] = 'outsideBusinessHours';
    return { ok: false, errors };
  }
  return { ok: true, days: week.days };
}

export { copyToAllDays } from './hours'; // moved to lib/hours.ts in 6.6 (shared with the business editor)

export const dayOffInputSchema = z.object({
  fromDate: z.string().refine(isDateKey, 'invalidDate'),
  toDate: z.string().refine(isDateKey, 'invalidDate'),
  reason: z
    .string()
    .trim()
    .max(120, 'reasonTooLong')
    .optional()
    .transform((v) => v || undefined),
});
export type DayOffInput = z.infer<typeof dayOffInputSchema>;

/** Range rules that need today's local key (kept out of the schema so it stays pure of the clock). */
export function checkDayOffRange(r: { fromDate: string; toDate: string }, todayKey: string): FieldErrors | null {
  if (r.toDate < r.fromDate) return { toDate: 'toBeforeFrom' };
  if (r.toDate < todayKey) return { toDate: 'inPast' };
  if (r.toDate > addDaysToKey(r.fromDate, MAX_DAY_OFF_SPAN_DAYS - 1)) return { toDate: 'tooLong' };
  return null;
}
