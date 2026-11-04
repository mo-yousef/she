/**
 * Timezone helpers. The whole product treats Europe/Nicosia as the single
 * business wall-clock. Everything is stored and computed in UTC; we convert at
 * the edges using date-fns-tz so daylight-saving transitions are handled
 * correctly (Cyprus: EET/EEST, +02:00 winter, +03:00 summer).
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const BUSINESS_TZ = 'Europe/Nicosia';

/** Minutes since local midnight, in the given zone, for a UTC instant. */
export function minutesOfDayInZone(utc: Date, tz: string = BUSINESS_TZ): number {
  const z = toZonedTime(utc, tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** Weekday in the given zone: 0 = Sunday .. 6 = Saturday. */
export function weekdayInZone(utc: Date, tz: string = BUSINESS_TZ): number {
  return toZonedTime(utc, tz).getDay();
}

/** 'YYYY-MM-DD' for the local calendar date of a UTC instant in the zone. */
export function localDateKey(utc: Date, tz: string = BUSINESS_TZ): string {
  const z = toZonedTime(utc, tz);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  const d = String(z.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convert a local wall-clock time (a 'YYYY-MM-DD' day + minutes from midnight)
 * in the given zone to the exact UTC instant. DST-correct: on the spring-forward
 * day a non-existent local time is shifted forward by date-fns-tz; on fall-back
 * the earlier of the two instants is chosen. Callers step on the slot grid, so
 * the rare ambiguous minute is never a valid slot start in practice.
 */
export function zonedWallTimeToUtc(
  dateKey: string,
  minutesFromMidnight: number,
  tz: string = BUSINESS_TZ,
): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const mins = minutesFromMidnight % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  // Build a naive local timestamp string; fromZonedTime interprets it in `tz`.
  return fromZonedTime(`${dateKey}T${hh}:${mm}:00`, tz);
}

/** Add days to a 'YYYY-MM-DD' key using UTC arithmetic (calendar-safe). */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
