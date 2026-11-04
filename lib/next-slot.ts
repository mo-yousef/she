import type { DayAvailability } from './availability';

/**
 * Pure helpers for the cached "next available slot" (requirement 1.2).
 * Kept free of DB / next/cache imports so they are unit-testable.
 */

/** Short window: a stale slot on a card is harmless, booking re-validates server-side. */
export const NEXT_SLOT_REVALIDATE_SECONDS = 180;

/** Cards scan this many days ahead for the first free slot. */
export const NEXT_SLOT_SCAN_DAYS = 14;

/** Tag owner-edit flows pass to `revalidateTag` (hours, services, team, blocks, bookings). */
export function availabilityTag(businessId: string): string {
  return `business:${businessId}:availability`;
}

/** Cache key parts: per business and per local date, so the entry rolls over at midnight. */
export function nextSlotKeyParts(businessId: string, dateKey: string): string[] {
  return ['next-slot', businessId, dateKey];
}

/** ISO start of the earliest slot across the scanned days, or null when none. */
export function pickNextSlotIso(days: DayAvailability[]): string | null {
  for (const day of days) {
    const first = day.slots[0];
    if (first) return first.startsAt.toISOString();
  }
  return null;
}
