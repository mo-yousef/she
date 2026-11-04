/**
 * Booking creation core (requirements 4.1, 4.2). Server-only.
 *
 * Takes ALREADY-VALIDATED input (bookingInputSchema) plus the session user id and
 * writes one Booking, never trusting client state:
 *   - price, duration, end time, status and staff come from the DB / settings;
 *   - the exact slot is re-validated against FRESH availability;
 *   - the write is one transaction that row-locks the candidate staff, re-checks
 *     overlap against bookings AND blocks (the exclusion constraint only covers
 *     booking-vs-booking), then inserts;
 *   - if two requests still race, Postgres' `booking_no_overlap` exclusion
 *     constraint (SQLSTATE 23P01) rejects the loser, which maps to SLOT_TAKEN;
 *   - `idempotencyKey` makes a retried submit return the original booking.
 */
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { hasConflict, lockStaff, staffBookableOn } from './booking-lock';
import { slotStaffIds, pickStaffForSlot } from './availability';
import { loadAvailabilityInput } from './booking-availability';
import { isExclusionViolation, isForeignKeyViolation, uniqueViolationOn } from './booking-errors';
import type { ParsedBookingInput } from './booking-schema';
import { generateReference } from './reference';
import { parseSettings } from './settings';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from './time';
import { createManageToken } from './tokens';

export const ACTIVE = ['PENDING', 'CONFIRMED'] as const;
const MAX_REFERENCE_ATTEMPTS = 5;
/** The manage link keeps working this long after the appointment ends. */
export const MANAGE_TOKEN_GRACE_MS = 30 * 86_400_000;

export type CreateBookingCore =
  | {
    ok: true;
    /** false when an idempotent retry returned the booking made by the first submit */
    created: boolean;
    bookingId: string;
    businessId: string;
    reference: string;
    /** Raw manage token: only for building the confirmation link. Only its hash is stored. */
    manageToken: string;
  }
  | { ok: false; code: 'VALIDATION' | 'SLOT_TAKEN' | 'DAILY_LIMIT' };

/**
 * Deterministic from (bookingId, endsAt), so an idempotent retry can rebuild the
 * same link without the raw token ever being stored.
 */
export function manageTokenFor(bookingId: string, endsAt: Date) {
  return createManageToken(bookingId, endsAt.getTime() + MANAGE_TOKEN_GRACE_MS);
}

/** Whole local calendar days from `fromKey` to `toKey` (UTC arithmetic on date keys). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const ms = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(toKey) - ms(fromKey)) / 86_400_000);
}

/** Identity keys a customer can be counted under: account id, email, phone (sorted: stable lock order). */
function customerKeys(customerId: string | undefined, d: { email: string; phone: string }): string[] {
  return [...(customerId ? [`c:${customerId}`] : []), `e:${d.email.toLowerCase()}`, `p:${d.phone}`].sort();
}

export async function createBookingRecord(params: {
  input: ParsedBookingInput;
  /** From the session ONLY. Never from client input. */
  customerId?: string;
  now?: Date;
}): Promise<CreateBookingCore> {
  const { input, customerId } = params;
  const now = params.now ?? new Date();
  const startsAt = new Date(input.startsAt);

  const business = await db.business.findFirst({
    where: { slug: input.businessSlug, status: 'PUBLISHED' },
    select: {
      id: true,
      settings: true,
      services: {
        where: { id: input.serviceId, active: true },
        select: { id: true, priceCents: true, durationMin: true },
      },
    },
  });
  const service = business?.services[0];
  if (!business || !service) return { ok: false, code: 'VALIDATION' };

  // Idempotent retry: answer from the booking the first submit created. Checked
  // BEFORE availability, because that slot is now (correctly) taken by this booking.
  const prior = await findByKey(input.idempotencyKey);
  if (prior) return replay(prior, business.id, input, startsAt);

  // Fresh availability for exactly the day requested.
  const dayOffset = daysBetweenKeys(
    localDateKey(now, BUSINESS_TZ),
    localDateKey(startsAt, BUSINESS_TZ),
  );
  const settings = parseSettings(business.settings);
  if (dayOffset < 0 || dayOffset > settings.maxAdvanceDays + 1)
    return { ok: false, code: 'SLOT_TAKEN' };
  const loaded = await loadAvailabilityInput({
    businessId: business.id,
    serviceId: service.id,
    staffId: input.staffId,
    days: dayOffset + 1,
    now,
  });
  // Unknown service/staff pairing (e.g. staff who does not offer it) is tampering, not a race.
  if (!loaded) return { ok: false, code: 'VALIDATION' };

  const isAny = input.staffId === 'any';
  const candidates = slotStaffIds(loaded.input, startsAt);
  if (candidates.length === 0) return { ok: false, code: 'SLOT_TAKEN' };

  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
  const bufferMin = loaded.input.service.bufferMin ?? settings.bufferMin;
  const endWithBuffer = new Date(endsAt.getTime() + bufferMin * 60_000);
  const dateKey = localDateKey(startsAt, BUSINESS_TZ);
  const dayStart = zonedWallTimeToUtc(dateKey, 0);
  const dayEnd = zonedWallTimeToUtc(addDaysToKey(dateKey, 1), 0);

  const bookingId = randomUUID();
  const token = manageTokenFor(bookingId, endsAt);

  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    const reference = generateReference();
    try {
      const booking = await db.$transaction(async (tx) => {
        // maxPerCustomerPerDay (6.8): one advisory lock per (business, customer identity, day) makes the
        // count below race-safe even across different staff (the staff lock alone only covers one staff).
        // Taken BEFORE the staff locks by every online path; owners' manual bookings never take it.
        for (const key of customerKeys(customerId, input.details)) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${business.id}:${key}:${dateKey}`}))`;
        }
        // Serialise concurrent bookings for these staff (sorted => no deadlock).
        await lockStaff(tx, candidates);
        // Unpublished after the pre-lock read (6.8): refuse rather than book an offline listing.
        const live = await tx.business.count({ where: { id: business.id, status: 'PUBLISHED' } });
        if (live === 0) return 'OFFLINE' as const;
        const sameDay = await tx.booking.count({
          where: {
            businessId: business.id,
            status: { in: [...ACTIVE] },
            startsAt: { gte: dayStart, lt: dayEnd },
            OR: [
              ...(customerId ? [{ customerId }] : []),
              { guestEmail: { equals: input.details.email, mode: 'insensitive' as const } },
              { guestPhone: input.details.phone },
            ],
          },
        });
        if (sameDay >= settings.maxPerCustomerPerDay) return 'DAILY_LIMIT' as const;

        // Least-booked-first for "any available" (counts read inside the tx).
        const counts = new Map<string, number>();
        if (isAny) {
          const grouped = await tx.booking.groupBy({
            by: ['staffId'],
            where: {
              staffId: { in: candidates },
              status: { in: [...ACTIVE] },
              startsAt: { gte: dayStart, lt: dayEnd },
            },
            _count: { _all: true },
          });
          for (const g of grouped) counts.set(g.staffId, g._count._all);
        }

        let remaining = [...candidates];
        while (remaining.length > 0) {
          const staffId = pickStaffForSlot(remaining, counts)!;
          remaining = remaining.filter((id) => id !== staffId);

          // Cross-table booking-vs-block overlap is checked here (the DB cannot); block
          // creation takes the same staff row lock (lib/booking-lock.ts).
          if (await hasConflict(tx, staffId, startsAt, endWithBuffer)) continue;
          // A day off / deactivation committed after the pre-lock availability read (6.5).
          if (!(await staffBookableOn(tx, staffId, dateKey))) continue;

          return tx.booking.create({
            data: {
              id: bookingId,
              reference,
              businessId: business.id,
              serviceId: service.id,
              staffId,
              customerId: customerId ?? null,
              guestName: input.details.name,
              guestEmail: input.details.email,
              guestPhone: input.details.phone,
              note: input.details.note ?? null,
              startsAt,
              endsAt,
              status: settings.autoConfirm ? 'CONFIRMED' : 'PENDING',
              priceCents: service.priceCents,
              source: 'ONLINE',
              locale: input.locale,
              manageTokenHash: token.hash,
              idempotencyKey: input.idempotencyKey,
            },
            select: { id: true, reference: true },
          });
        }
        return null;
      });

      if (booking === 'OFFLINE') return { ok: false, code: 'VALIDATION' };
      if (booking === 'DAILY_LIMIT') return { ok: false, code: 'DAILY_LIMIT' };
      if (!booking) {
        // Lost to a booking that landed while we waited on the lock. If that booking
        // is our own duplicate submit (same key), answer idempotently, not SLOT_TAKEN.
        const own = await findByKey(input.idempotencyKey);
        return own
          ? replay(own, business.id, input, startsAt)
          : { ok: false, code: 'SLOT_TAKEN' };
      }
      return {
        ok: true,
        created: true,
        bookingId: booking.id,
        businessId: business.id,
        reference: booking.reference,
        manageToken: token.token,
      };
    } catch (e) {
      // The owner deleted the service between our read and the insert (6.4): treat as unknown service.
      if (isForeignKeyViolation(e)) return { ok: false, code: 'VALIDATION' };
      const unique = uniqueViolationOn(e);
      if (unique === 'reference') continue; // rare collision: new reference, new tx
      // A concurrent duplicate submit can lose the race on EITHER constraint
      // (the exclusion constraint and the idempotencyKey unique index both fire
      // on the same losing row, in either order). Check for our own key's row
      // before treating a loss as a genuine SLOT_TAKEN.
      if (unique === 'idempotencyKey' || isExclusionViolation(e)) {
        const winner = await findByKey(input.idempotencyKey);
        if (winner) return replay(winner, business.id, input, startsAt);
        if (isExclusionViolation(e)) return { ok: false, code: 'SLOT_TAKEN' };
      }
      throw e;
    }
  }
  throw new Error('Could not allocate a unique booking reference');
}

function findByKey(idempotencyKey: string) {
  return db.booking.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      reference: true,
      businessId: true,
      serviceId: true,
      startsAt: true,
      endsAt: true,
      guestEmail: true,
    },
  });
}

/** Only answer a retry from the booking it belongs to (key reuse for another slot is tampering). */
function replay(
  existing: {
    id: string;
    reference: string;
    businessId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    guestEmail: string | null;
  },
  businessId: string,
  input: ParsedBookingInput,
  startsAt: Date,
): CreateBookingCore {
  const same =
    existing.businessId === businessId &&
    existing.serviceId === input.serviceId &&
    existing.startsAt.getTime() === startsAt.getTime() &&
    existing.guestEmail === input.details.email;
  if (!same) return { ok: false, code: 'VALIDATION' };
  return {
    ok: true,
    created: false,
    bookingId: existing.id,
    businessId,
    reference: existing.reference,
    manageToken: manageTokenFor(existing.id, existing.endsAt).token,
  };
}
