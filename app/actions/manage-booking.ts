'use server';
/**
 * Server actions for the manage-booking page (requirement 3.2). Every action is
 * its own trust boundary: it re-verifies the signed token and re-loads the
 * booking from the DB, never trusting that the page already checked either.
 *
 * Reschedule picks "update the existing row inside a transaction" over
 * "cancel + recreate": a single UPDATE of startsAt/endsAt lets Postgres' own
 * exclusion constraint evaluate the NEW range against every OTHER row directly
 * (a row never conflicts with its own prior range), so the race-detection path
 * from lib/booking.ts (catch 23P01 -> SLOT_TAKEN) reuses unchanged. Cancel+
 * recreate would need a second reference/manage-token issuance and a window
 * where the slot is briefly double-freed, for no benefit here.
 */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyManageToken } from '@/lib/tokens';
import { isExclusionViolation } from '@/lib/booking-errors';
import { staffBookableOn } from '@/lib/booking-lock';
import { withinChangeWindow, isChangeableStatus } from '@/lib/manage-policy';
import { ACTIVE, daysBetweenKeys, manageTokenFor } from '@/lib/booking';
import { queueBookingNotice } from '@/lib/notify/booking-notices';
import { BUSINESS_TZ, localDateKey } from '@/lib/time';
import { loadAvailabilityInput } from '@/lib/booking-availability';
import { isSlotAvailable } from '@/lib/availability';
import { parseSettings } from '@/lib/settings';
import { availabilityTag } from '@/lib/next-slot';

const identitySchema = z.object({
  businessSlug: z.string().min(1).max(80),
  reference: z.string().regex(/^SC-[A-Z0-9]{5}$/),
  token: z.string().min(1).max(200),
});

export type ManageActionResult =
  | {
    ok: true;
    /** Reschedule only: the re-issued token; the link must use it. */
    newToken?: string;
  }
  | {
    ok: false;
    code: 'NOT_FOUND' | 'NOT_CHANGEABLE' | 'PAST_CUTOFF' | 'SLOT_TAKEN' | 'VALIDATION' | 'UNKNOWN';
  };

/** Loads + re-verifies the booking fresh for one action. Null on ANY failure. */
async function loadForAction(identity: { businessSlug: string; reference: string; token: string }) {
  const booking = await db.booking.findFirst({
    where: { reference: identity.reference, business: { slug: identity.businessSlug } },
    select: {
      id: true,
      businessId: true,
      serviceId: true,
      staffId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      manageTokenHash: true,
      business: { select: { settings: true } },
      service: { select: { durationMin: true, bufferMin: true } },
    },
  });
  if (!booking) return null;
  if (!verifyManageToken(identity.token, booking.manageTokenHash)) return null;
  return booking;
}

// No `now` parameter: server-action arguments are client-controlled, so the clock
// must never be an input.
export async function cancelBooking(input: unknown): Promise<ManageActionResult> {
  const now = new Date();
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION' };

  try {
    const booking = await loadForAction(parsed.data);
    if (!booking) return { ok: false, code: 'NOT_FOUND' };
    if (!isChangeableStatus(booking.status)) return { ok: false, code: 'NOT_CHANGEABLE' };

    const settings = parseSettings(booking.business.settings);
    if (!withinChangeWindow(now, booking.startsAt, settings.cancellationWindowHours)) {
      return { ok: false, code: 'PAST_CUTOFF' };
    }

    // Status flip only: the exclusion constraint's WHERE clause already excludes
    // CANCELLED_BY_CUSTOMER, so the slot is free the instant this commits.
    // Guarded on status so a concurrent cancel/complete is not overwritten.
    const { count } = await db.booking.updateMany({
      where: { id: booking.id, status: { in: [...ACTIVE] } },
      data: { status: 'CANCELLED_BY_CUSTOMER', cancelledAt: now },
    });
    if (count === 0) return { ok: false, code: 'NOT_CHANGEABLE' };

    revalidateTag(availabilityTag(booking.businessId));
    queueBookingNotice('cancelled', booking.id);
    return { ok: true };
  } catch (e) {
    console.error('cancelBooking failed', e instanceof Error ? e.name : 'unknown');
    return { ok: false, code: 'UNKNOWN' };
  }
}

const rescheduleSchema = identitySchema.extend({
  startsAt: z.string().datetime(),
});

export async function rescheduleBooking(input: unknown): Promise<ManageActionResult> {
  const now = new Date();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION' };
  const newStartsAt = new Date(parsed.data.startsAt);

  try {
    const booking = await loadForAction(parsed.data);
    if (!booking) return { ok: false, code: 'NOT_FOUND' };
    if (!isChangeableStatus(booking.status)) return { ok: false, code: 'NOT_CHANGEABLE' };

    const settings = parseSettings(booking.business.settings);
    // Same policy gate as cancel: moving the appointment is a change too, and
    // past the cutoff only the business can accommodate it.
    if (!withinChangeWindow(now, booking.startsAt, settings.cancellationWindowHours)) {
      return { ok: false, code: 'PAST_CUTOFF' };
    }

    // Fresh (uncached) availability, excluding this booking's own current slot
    // so re-querying never treats it as a conflict with itself.
    const dayOffset = daysBetweenKeys(localDateKey(now, BUSINESS_TZ), localDateKey(newStartsAt, BUSINESS_TZ));
    if (dayOffset < 0 || dayOffset > settings.maxAdvanceDays + 1) return { ok: false, code: 'SLOT_TAKEN' };
    const loaded = await loadAvailabilityInput({
      businessId: booking.businessId,
      serviceId: booking.serviceId,
      staffId: booking.staffId,
      days: dayOffset + 1,
      now,
      excludeBookingId: booking.id,
    });
    if (!loaded) return { ok: false, code: 'VALIDATION' };
    if (!isSlotAvailable(loaded.input, { startsAt: newStartsAt, staffId: booking.staffId })) {
      return { ok: false, code: 'SLOT_TAKEN' };
    }

    const newEndsAt = new Date(newStartsAt.getTime() + booking.service.durationMin * 60_000);
    const bufferMin = loaded.input.service.bufferMin ?? settings.bufferMin;
    const endWithBuffer = new Date(newEndsAt.getTime() + bufferMin * 60_000);

    // Always re-issue. The raw token is never stored, so notices and reminders (5.2/5.3)
    // rebuild it from (id, endsAt) via manageTokenFor(); that matches the stored hash only
    // if the hash always follows the current end time. The old link stops working; the
    // page swaps in `newToken` and the reschedule notice carries the new link.
    const fresh = manageTokenFor(booking.id, newEndsAt);

    try {
      const outcome = await db.$transaction(async (tx) => {
        // Same serialisation as createBookingRecord: lock the staff row so two
        // concurrent moves/bookings for this person queue up.
        await tx.$queryRaw`SELECT "id" FROM "StaffMember" WHERE "id" = ${booking.staffId} FOR UPDATE`;

        // shortcut: booking-vs-block overlap is checked here, not by the DB
        // (docs/shortcuts.md "Booking-vs-Block cross-table overlap").
        const overlap = { staffId: booking.staffId, startsAt: { lt: endWithBuffer }, endsAt: { gt: newStartsAt } };
        const clashBooking = await tx.booking.findFirst({
          where: { ...overlap, id: { not: booking.id }, status: { in: [...ACTIVE] } },
          select: { id: true },
        });
        const clashBlock = clashBooking ? null : await tx.block.findFirst({ where: overlap, select: { id: true } });
        if (clashBooking || clashBlock) return 'SLOT_TAKEN' as const;
        // A day off added after the pre-lock availability read (6.5).
        if (!(await staffBookableOn(tx, booking.staffId, localDateKey(newStartsAt, BUSINESS_TZ)))) return 'SLOT_TAKEN' as const;

        // Guarded on status so a booking cancelled in another tab between the
        // load above and here is not silently resurrected.
        const { count } = await tx.booking.updateMany({
          where: { id: booking.id, status: { in: [...ACTIVE] } },
          data: {
            startsAt: newStartsAt,
            endsAt: newEndsAt,
            manageTokenHash: fresh.hash,
          },
        });
        return count === 0 ? ('NOT_CHANGEABLE' as const) : ('OK' as const);
      });
      if (outcome !== 'OK') return { ok: false, code: outcome };
    } catch (e) {
      // Someone else took the slot between the check above and this write.
      if (isExclusionViolation(e)) return { ok: false, code: 'SLOT_TAKEN' };
      throw e;
    }

    revalidateTag(availabilityTag(booking.businessId));
    queueBookingNotice('rescheduled', booking.id, { previousStartsAt: booking.startsAt });
    return { ok: true, newToken: fresh.token };
  } catch (e) {
    console.error('rescheduleBooking failed', e instanceof Error ? e.name : 'unknown');
    return { ok: false, code: 'UNKNOWN' };
  }
}
