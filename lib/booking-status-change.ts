/**
 * Owner-driven booking status change (tasks 6.2 / 6.3, req 3.3 and 5.1). Server-only.
 * Generic on purpose: the 6.3 bookings table calls the same core. Rules live in
 * `booking-status.ts`; this adds ownership, an atomic guarded update, and the audit row.
 */
import { db } from './db';
import { assertOwnsBusiness, ownerAuthCode } from './owner-auth';
import { writeAudit } from './audit';
import {
  checkTransition,
  type BookingStatusName,
  type TransitionCheck,
} from './booking-status';

export type ChangeStatusResult =
  | {
    ok: true;
    businessId: string;
    slug: string;
    /** True when the customer should get a cancellation notice (only if they left a contact). */
    notifyCancelled: boolean;
  }
  | {
    ok: false;
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_ALLOWED';
    reason?: Exclude<TransitionCheck, 'OK'> | 'CHANGED';
  };

const TARGETS: readonly BookingStatusName[] = [
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED_BY_BUSINESS',
];

export async function changeBookingStatusCore(
  userId: string | null | undefined,
  businessId: string,
  bookingId: string,
  to: string,
  now: Date = new Date(),
): Promise<ChangeStatusResult> {
  let owned;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return { ok: false, code: ownerAuthCode(e) };
  }
  if (!TARGETS.includes(to as BookingStatusName))
    return { ok: false, code: 'NOT_ALLOWED', reason: 'INVALID_TRANSITION' };
  const target = to as BookingStatusName;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      businessId: true,
      status: true,
      startsAt: true,
      source: true,
      guestEmail: true,
      guestPhone: true,
    },
  });
  if (!booking || booking.businessId !== owned.business.id)
    return { ok: false, code: 'NOT_FOUND' };

  const check = checkTransition(booking.status, target, booking.startsAt, now);
  if (check !== 'OK') return { ok: false, code: 'NOT_ALLOWED', reason: check };

  // Guarded on the status we read, so a concurrent change (customer cancelled, another tab)
  // is never overwritten.
  // Update and audit row commit together (req 5.1).
  const changed = await db.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: booking.status },
      data:
        target === 'CANCELLED_BY_BUSINESS'
          ? { status: target, cancelledAt: now }
          : { status: target },
    });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId: owned.user.id,
        businessId: owned.business.id,
        action: 'booking.status',
        meta: { bookingId: booking.id, from: booking.status, to: target },
      },
      tx,
    );
    return true;
  });
  if (!changed) return { ok: false, code: 'NOT_ALLOWED', reason: 'CHANGED' };

  // MANUAL bookings are email-only (consent rule, 5.2); ONLINE may also have a phone.
  const hasContact =
    Boolean(booking.guestEmail) ||
    (booking.source === 'ONLINE' && Boolean(booking.guestPhone));
  return {
    ok: true,
    businessId: owned.business.id,
    slug: owned.business.slug,
    notifyCancelled: target === 'CANCELLED_BY_BUSINESS' && hasContact,
  };
}
