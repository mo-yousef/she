/**
 * Full-day slot grid for the booking UI (requirement 3.1).
 *
 * computeAvailability() returns only AVAILABLE slots. To show unavailable times
 * struck through we rebuild the day's candidate starts with the same rule the
 * engine uses (start every `stepMin` from opening while start + duration + buffer
 * still fits before closing; union over the staff windows) and mark each as
 * available if the engine returned it. Pure: no clock, no DB.
 *
 * shortcut: lead-time / max-advance gates are not re-derived here; a time the
 * engine dropped for those reasons simply shows as unavailable, which is correct.
 */
import type { DateRange, OpeningHour } from './availability';
import { BUSINESS_TZ, weekdayInZone, zonedWallTimeToUtc } from './time';

export interface GridWindow {
  opensMin: number; // minutes from local midnight
  closesMin: number;
}

export interface GridSlot {
  startsAt: Date; // UTC
  available: boolean;
}

export function buildDayGrid(input: {
  dateKey: string;
  /** Open windows for that day (one per working staff member, or the business window). */
  windows: GridWindow[];
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  /** Start instants the engine reported as available for that day. */
  available: Date[];
  timezone?: string;
}): GridSlot[] {
  const tz = input.timezone ?? BUSINESS_TZ;
  const free = new Set(input.available.map((d) => d.getTime()));

  const starts = new Set<number>();
  for (const w of input.windows) {
    for (let m = w.opensMin; m + input.durationMin + input.bufferMin <= w.closesMin; m += input.stepMin) {
      // Instants (not minutes) are the key, so a DST gap that maps two local
      // times to one instant yields a single slot.
      starts.add(zonedWallTimeToUtc(input.dateKey, m, tz).getTime());
    }
  }

  return [...starts]
    .sort((a, b) => a - b)
    .map((t) => ({ startsAt: new Date(t), available: free.has(t) }));
}

/**
 * Open windows for one local date, one per staff member in scope (their own
 * hours, else the business hours). Empty on closures and closed weekdays.
 */
export function dayWindows(input: {
  dateKey: string;
  openingHours: OpeningHour[];
  /** One entry per staff member in scope; undefined = use business hours. */
  staffHours: (OpeningHour[] | undefined)[];
  /** Parallel to `staffHours`: each member's expanded day-off keys (task 6.5). */
  staffDaysOff?: (string[] | undefined)[];
  closures: DateRange[];
  timezone?: string;
}): GridWindow[] {
  const tz = input.timezone ?? BUSINESS_TZ;
  if (input.closures.some((c) => input.dateKey >= c.from && input.dateKey <= c.to)) return [];
  const weekday = weekdayInZone(zonedWallTimeToUtc(input.dateKey, 0, tz), tz);
  const out: GridWindow[] = [];
  for (const [i, hours] of input.staffHours.entries()) {
    if (input.staffDaysOff?.[i]?.includes(input.dateKey)) continue;
    const h = (hours ?? input.openingHours).find((x) => x.weekday === weekday);
    if (h && !h.closed) out.push({ opensMin: h.opensMin, closesMin: h.closesMin });
  }
  return out;
}
