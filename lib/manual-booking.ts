/**
 * Manual booking creation (walk-in / phone), task 6.2, req 5.1. Server-only.
 *
 * Unlike the public flow, the owner is creating the booking themselves right now: lead
 * time and opening hours are NOT enforced (walk-ins happen outside both), but the slot
 * must still not overlap another active booking or a block for that staff member,
 * including the service buffer — enforced with the same lock + re-check as
 * `createBookingRecord` (lib/booking-lock.ts) so a manual booking can never double-book.
 */
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { assertOwnsBusiness, ownerAuthCode } from './owner-auth';
import { hasConflict, lockStaff } from './booking-lock';
import { manageTokenFor } from './booking';
import { isExclusionViolation, uniqueViolationOn } from './booking-errors';
import { writeAudit } from './audit';
import { generateReference } from './reference';
import { manualBookingInputSchema } from './calendar-schema';
import { localDateKey, minutesOfDayInZone, zonedWallTimeToUtc } from './time';

const MAX_REFERENCE_ATTEMPTS = 5;
/** Owners can log a walk-in just after it happened; not a backdating tool. */
const PAST_GRACE_MS = 24 * 3_600_000;

export type ManualBookingResult =
  | {
      ok: true;
      /** false when a double submit returned the booking the first submit made */
      created: boolean;
      bookingId: string;
      reference: string;
      businessId: string;
      slug: string;
      /** Whether a confirmation email should be sent (MANUAL notices are email-only). */
      hasContact: boolean;
    }
  | {
      ok: false;
      code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'VALIDATION' | 'OVERLAP' | 'UNKNOWN';
      errors?: Record<string, string>;
    };

export async function createManualBookingCore(
  userId: string | null | undefined,
  businessId: string,
  raw: unknown,
): Promise<ManualBookingResult> {
  let owned;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return { ok: false, code: ownerAuthCode(e) };
  }

  const parsed = manualBookingInputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return { ok: false, code: 'VALIDATION', errors };
  }
  const input = parsed.data;

  const [hh, mm] = input.time.split(':').map(Number);
  const startsAt = zonedWallTimeToUtc(input.date, hh! * 60 + mm!);
  // A wall-clock time inside the spring-forward gap shifts to the next day/hour: reject it.
  if (
    localDateKey(startsAt) !== input.date ||
    minutesOfDayInZone(startsAt) !== hh! * 60 + mm!
  ) {
    return { ok: false, code: 'VALIDATION', errors: { time: 'invalidTime' } };
  }
  const now = Date.now();
  if (startsAt.getTime() < now - PAST_GRACE_MS)
    return { ok: false, code: 'VALIDATION', errors: { date: 'tooFarInPast' } };
  if (startsAt.getTime() > now + 400 * 86_400_000)
    return { ok: false, code: 'VALIDATION', errors: { date: 'tooFarAhead' } };

  // Scoped to the business so another business can never collide with (or probe) a key.
  const idempotencyKey = input.idempotencyKey
    ? `manual:${owned.business.id}:${input.idempotencyKey}`
    : null;
  const replay = async (): Promise<ManualBookingResult | null> => {
    if (!idempotencyKey) return null;
    const prior = await db.booking.findUnique({
      where: { idempotencyKey },
      select: { id: true, reference: true },
    });
    return prior
      ? {
          ok: true,
          bookingId: prior.id,
          reference: prior.reference,
          businessId: owned.business.id,
          slug: owned.business.slug,
          hasContact: false,
          created: false,
        }
      : null;
  };
  const prior = await replay();
  if (prior) return prior;

  const business = await db.business.findUnique({
    where: { id: owned.business.id },
    select: {
      id: true,
      slug: true,
      services: {
        where: { id: input.serviceId },
        select: {
          id: true,
          durationMin: true,
          bufferMin: true,
          priceCents: true,
          active: true,
        },
      },
      staff: {
        where: { id: input.staffId },
        select: { id: true, services: { select: { serviceId: true } } },
      },
    },
  });
  const service = business?.services[0];
  const staff = business?.staff[0];
  if (!business || !service || !staff) return { ok: false, code: 'VALIDATION' };
  if (!staff.services.some((l) => l.serviceId === service.id))
    return { ok: false, code: 'VALIDATION', errors: { staffId: 'doesNotOfferService' } };

  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
  const endWithBuffer = new Date(endsAt.getTime() + (service.bufferMin ?? 0) * 60_000);
  const priceCents = input.priceCents ?? service.priceCents;
  const bookingId = randomUUID();
  const token = manageTokenFor(bookingId, endsAt);

  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    const reference = generateReference();
    try {
      const created = await db.$transaction(async (tx) => {
        await lockStaff(tx, [staff.id]);
        if (await hasConflict(tx, staff.id, startsAt, endWithBuffer)) return null;
        const row = await tx.booking.create({
          data: {
            id: bookingId,
            reference,
            businessId: business.id,
            serviceId: service.id,
            staffId: staff.id,
            guestName: input.name,
            guestEmail: input.email ?? null,
            guestPhone: input.phone ?? null,
            note: input.note ?? null,
            startsAt,
            endsAt,
            status: input.status,
            priceCents,
            source: 'MANUAL',
            locale: input.locale,
            manageTokenHash: token.hash,
            idempotencyKey,
          },
          select: { id: true, reference: true },
        });
        await writeAudit(
          {
            actorId: owned.user.id,
            businessId: business.id,
            action: 'booking.manual-create',
            meta: { bookingId: row.id },
          },
          tx,
        );
        return row;
      });
      // Lost to a concurrent duplicate submit of this very form? Answer idempotently.
      if (!created) return (await replay()) ?? { ok: false, code: 'OVERLAP' };
      return {
        ok: true,
        created: true,
        bookingId: created.id,
        reference: created.reference,
        businessId: business.id,
        slug: business.slug,
        // MANUAL notices are email-only (consent rule, 5.2), so only an email counts.
        hasContact: Boolean(input.email) && input.sendConfirmation,
      };
    } catch (e) {
      if (uniqueViolationOn(e) === 'reference') continue;
      // A concurrent double submit loses on the key or on the overlap constraint.
      const winner = await replay();
      if (winner) return winner;
      if (isExclusionViolation(e)) return { ok: false, code: 'OVERLAP' };
      throw e;
    }
  }
  return { ok: false, code: 'UNKNOWN' };
}
