/**
 * Business hours + closures input rules (task 6.6, req 5.1). Pure: no DB, no clock.
 *
 *  - Weekly hours: all 7 weekdays, one window per day (no split shifts), close after open.
 *    Validation is `validateWeek` from lib/hours.ts (shared with onboarding). A week with
 *    every day closed is NOT rejected here: it is saved with a `NO_OPEN_DAYS` warning.
 *  - Closures: inclusive local 'YYYY-MM-DD' ranges, same rules as staff days off (to >= from,
 *    at most 366 days, not entirely in the past), reason up to 120 chars, max 200 per business.
 * Field errors use `day-<weekday>` / `form` / `fromDate` / `toDate` / `reason` keys; the
 * values are i18n key suffixes under `hours.validation.*`.
 */
import { z } from 'zod';
import { validateWeek, type DayHours } from './hours';
import { checkDayOffRange, dayOffInputSchema } from './team-schema';

export const MAX_CLOSURES = 200;
export const MAX_CLOSURE_SPAN_DAYS = 366;

// Shape only: ranges (0..1440, close after open) are `validateWeek`'s job, so every bad day is reported.
const hoursDaySchema = z.object({ weekday: z.number(), closed: z.boolean(), opensMin: z.number(), closesMin: z.number() });
export const businessHoursInputSchema = z.object({ days: z.array(hoursDaySchema).max(7) });

/** Validates raw `{ days }`. Returns the clean 7 rows (closed rows normalised to 0/0). */
export function checkBusinessHours(
  raw: unknown,
): { ok: true; days: DayHours[]; noOpenDays: boolean } | { ok: false; errors: Record<string, string> } {
  const parsed = businessHoursInputSchema.safeParse(raw);
  // NaN / non-integers from an unparsable time input fail the schema: report them as `range`
  // on the offending day when we can tell which one it is.
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    const days = (raw as { days?: unknown } | null)?.days;
    if (Array.isArray(days)) {
      for (const [i, d] of days.entries()) {
        const w = (d as { weekday?: unknown } | null)?.weekday;
        if (!hoursDaySchema.safeParse(d).success) errors[typeof w === 'number' && w >= 0 && w <= 6 ? `day-${w}` : `day-${i}`] = 'range';
      }
    }
    errors.form ??= Object.keys(errors).length ? 'invalid' : 'weekdays';
    return { ok: false, errors };
  }
  const week = validateWeek(parsed.data.days);
  if (week.ok) return { ok: true, days: week.days, noOpenDays: false };
  // "Every day closed" is a warning, not an error (a listing may pause bookings this way).
  if (week.errors.length === 1 && week.errors[0]!.code === 'allClosed') {
    return {
      ok: true,
      days: parsed.data.days.map((d) => ({ weekday: d.weekday, closed: true, opensMin: 0, closesMin: 0 })),
      noOpenDays: true,
    };
  }
  const errors: Record<string, string> = {};
  for (const e of week.errors) errors[e.weekday === null ? 'form' : `day-${e.weekday}`] ??= e.code;
  return { ok: false, errors };
}

export const closureInputSchema = dayOffInputSchema;
export type ClosureInput = z.infer<typeof closureInputSchema>;
/** Range rules that need today's local key. */
export const checkClosureRange = checkDayOffRange;
