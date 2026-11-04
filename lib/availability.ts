/**
 * Availability engine — the core of she.cy (requirements §4.2).
 *
 * This module is PURE: no database access, no reads of the system clock. The
 * caller injects `now` and all the data. That is what makes DST behaviour and
 * slot rules fully unit-testable, and it keeps the concurrency guard (the
 * Postgres exclusion constraint) as the single source of truth at write time.
 *
 * All instants are UTC `Date`s. Wall-clock reasoning (opening hours, closed
 * days) happens in the business timezone via lib/time.ts.
 */
import {
  BUSINESS_TZ,
  addDaysToKey,
  localDateKey,
  weekdayInZone,
  zonedWallTimeToUtc,
} from './time';

export interface BusinessSettings {
  slotIntervalMin: number; // 15 | 30 | 60
  bufferMin: number; // default buffer between appointments
  minLeadMin: number; // earliest booking relative to now (default 60)
  maxAdvanceDays: number; // furthest booking ahead (default 60)
  cancellationWindowHours: number;
  autoConfirm: boolean;
  maxPerCustomerPerDay: number;
}

export interface OpeningHour {
  weekday: number; // 0 = Sun .. 6 = Sat
  opensMin: number; // minutes from local midnight
  closesMin: number;
  closed: boolean;
}

/** A continuous busy interval for a staff member (booking or block). */
export interface BusyInterval {
  staffId: string;
  startsAt: Date; // UTC
  endsAt: Date; // UTC
}

export interface DateRange {
  /** inclusive local date key 'YYYY-MM-DD' */
  from: string;
  /** inclusive local date key 'YYYY-MM-DD' */
  to: string;
}

export interface StaffAvailabilityInput {
  id: string;
  /** Optional per-staff override of opening hours; falls back to business hours. */
  hours?: OpeningHour[];
  /** Local date keys the staff member is off. */
  daysOff?: string[];
}

export interface AvailabilityInput {
  now: Date;
  timezone?: string;
  settings: BusinessSettings;
  service: { durationMin: number; bufferMin?: number };
  staff: StaffAvailabilityInput[];
  openingHours: OpeningHour[];
  closures: DateRange[];
  bookings: BusyInterval[];
  blocks: BusyInterval[];
  /** Local date key to start from, e.g. today. */
  fromDateKey: string;
  /** Number of days to compute (strip length). */
  days: number;
  /** Restrict to a single staff member; omit for "any available". */
  staffId?: string;
}

export interface Slot {
  startsAt: Date; // UTC
  endsAt: Date; // UTC (duration only, excludes trailing buffer)
  availableStaffIds: string[]; // staff free for this slot
}

export interface DayAvailability {
  dateKey: string; // local 'YYYY-MM-DD'
  slots: Slot[];
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  // half-open intervals [start, end): touching at the boundary is NOT an overlap
  return aStart < bEnd && bStart < aEnd;
}

function dateKeyInRange(key: string, range: DateRange): boolean {
  return key >= range.from && key <= range.to;
}

function hoursForWeekday(hours: OpeningHour[], weekday: number): OpeningHour | undefined {
  return hours.find((h) => h.weekday === weekday);
}

/**
 * Pick the least-booked eligible staff member for a slot, for "any available"
 * assignment (requirement 4.2). `bookingCounts` maps staffId -> active bookings
 * in the window; ties break by the order staff were supplied.
 */
export function pickStaffForSlot(
  candidateStaffIds: string[],
  bookingCounts: Map<string, number>,
): string | undefined {
  let best: string | undefined;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const id of candidateStaffIds) {
    const count = bookingCounts.get(id) ?? 0;
    if (count < bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

export function computeAvailability(input: AvailabilityInput): DayAvailability[] {
  const tz = input.timezone ?? BUSINESS_TZ;
  const { settings, service, now } = input;
  const duration = service.durationMin;
  const buffer = service.bufferMin ?? settings.bufferMin;
  const slotStep = settings.slotIntervalMin;

  const earliest = new Date(now.getTime() + settings.minLeadMin * 60_000);
  const latest = new Date(now.getTime() + settings.maxAdvanceDays * 86_400_000);

  const staffList = input.staffId
    ? input.staff.filter((s) => s.id === input.staffId)
    : input.staff;

  // Index busy intervals by staff for quick lookup.
  const busyByStaff = new Map<string, BusyInterval[]>();
  for (const b of [...input.bookings, ...input.blocks]) {
    const arr = busyByStaff.get(b.staffId) ?? [];
    arr.push(b);
    busyByStaff.set(b.staffId, arr);
  }

  const result: DayAvailability[] = [];

  for (let d = 0; d < input.days; d++) {
    const dateKey = addDaysToKey(input.fromDateKey, d);
    const slots: Slot[] = [];

    // Weekday for this local date: derive from the local-midnight instant.
    const localMidnightUtc = zonedWallTimeToUtc(dateKey, 0, tz);
    const weekday = weekdayInZone(localMidnightUtc, tz);

    const isClosure = input.closures.some((c) => dateKeyInRange(dateKey, c));

    if (!isClosure) {
      // Build candidate slot starts from the union of staff open windows so the
      // grid is consistent across staff, then test each staff per candidate.
      const candidateStartsMin = new Set<number>();
      const windows = new Map<string, { opensMin: number; closesMin: number } | null>();

      for (const staff of staffList) {
        const offToday = staff.daysOff?.includes(dateKey) ?? false;
        const src = staff.hours ?? input.openingHours;
        const h = hoursForWeekday(src, weekday);
        if (offToday || !h || h.closed) {
          windows.set(staff.id, null);
          continue;
        }
        windows.set(staff.id, { opensMin: h.opensMin, closesMin: h.closesMin });
        for (let m = h.opensMin; m + duration + buffer <= h.closesMin; m += slotStep) {
          candidateStartsMin.add(m);
        }
      }

      const sortedStarts = [...candidateStartsMin].sort((a, b) => a - b);

      for (const startMin of sortedStarts) {
        const startUtc = zonedWallTimeToUtc(dateKey, startMin, tz);
        const endUtc = new Date(startUtc.getTime() + duration * 60_000);
        const endWithBufferUtc = new Date(endUtc.getTime() + buffer * 60_000);

        // Lead-time and max-advance gates (requirement 4.2).
        if (startUtc < earliest) continue;
        if (startUtc > latest) continue;

        const availableStaffIds: string[] = [];
        for (const staff of staffList) {
          const w = windows.get(staff.id);
          if (!w) continue;
          // Must fit inside this staff member's own window.
          if (startMin < w.opensMin) continue;
          if (startMin + duration + buffer > w.closesMin) continue;

          const busy = busyByStaff.get(staff.id) ?? [];
          const clash = busy.some((b) =>
            overlaps(startUtc, endWithBufferUtc, b.startsAt, b.endsAt),
          );
          if (!clash) availableStaffIds.push(staff.id);
        }

        if (availableStaffIds.length > 0) {
          slots.push({ startsAt: startUtc, endsAt: endUtc, availableStaffIds });
        }
      }
    }

    result.push({ dateKey, slots });
  }

  return result;
}

/**
 * Convenience: is a specific requested slot (staff + start) still offered?
 * Used by the booking orchestrator to re-validate server-side before writing
 * (requirements 3.1, 4.1). Compares on exact UTC start and staff membership.
 */
export function isSlotAvailable(
  input: AvailabilityInput,
  requested: { startsAt: Date; staffId?: string },
): boolean {
  const ids = slotStaffIds(input, requested.startsAt);
  return requested.staffId ? ids.includes(requested.staffId) : ids.length > 0;
}

/** Staff free for the slot starting exactly at `startsAt` (empty when it is not offered). */
export function slotStaffIds(input: AvailabilityInput, startsAt: Date): string[] {
  const dateKey = localDateKey(startsAt, input.timezone ?? BUSINESS_TZ);
  const day = computeAvailability(input).find((d) => d.dateKey === dateKey);
  const slot = day?.slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
  return slot?.availableStaffIds ?? [];
}
