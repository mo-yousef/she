/**
 * Self-contained DB fixtures for the booking concurrency tests (task 4.7).
 * Each call creates its OWN owner, published business, staff, one service and
 * opening hours with unique slugs, and cleanup() removes exactly what it created.
 * No seed data is needed and nothing is shared between tests. No real PII: every
 * email uses the reserved .test TLD and phones are random.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { bookingInputSchema, type ParsedBookingInput } from '../lib/booking-schema';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from '../lib/time';

export interface Fixture {
  businessId: string;
  slug: string;
  serviceId: string;
  staffIds: string[];
  /** Local (Europe/Nicosia) date of the target slot, 'YYYY-MM-DD'. */
  dateKey: string;
  /** The target slot start (10:00 Nicosia, 3 days out), ISO UTC. */
  slotIso: string;
  cleanup: () => Promise<void>;
}

export async function createFixture(staffCount = 1): Promise<Fixture> {
  const tag = randomUUID().slice(0, 8);
  const owner = await db.user.create({
    data: { email: `owner-${tag}@e2e.test`, name: 'E2E Owner', role: 'OWNER' },
  });
  const business = await db.business.create({
    data: {
      slug: `e2e-${tag}`,
      ownerId: owner.id,
      name: `E2E Studio ${tag}`,
      category: 'nails',
      city: 'Larnaca',
      status: 'PUBLISHED',
      // minLead 0 so the fixed future slot is never inside the lead window.
      settings: { autoConfirm: true, minLeadMin: 0, bufferMin: 0, slotIntervalMin: 30 },
      openingHours: {
        // Every day 09:00-18:00 so the target date works whatever weekday it falls on.
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMin: 540, closesMin: 1080 })),
      },
    },
  });
  const service = await db.service.create({
    data: { businessId: business.id, category: 'nails', name: 'E2E Manicure', durationMin: 60, priceCents: 3000 },
  });
  const staffIds: string[] = [];
  for (let i = 0; i < staffCount; i++) {
    const s = await db.staffMember.create({
      data: { businessId: business.id, name: `E2E Staff ${i + 1}`, sortOrder: i },
    });
    await db.staffService.create({ data: { staffId: s.id, serviceId: service.id } });
    staffIds.push(s.id);
  }

  const dateKey = addDaysToKey(localDateKey(new Date(), BUSINESS_TZ), 3);
  return {
    businessId: business.id,
    slug: business.slug,
    serviceId: service.id,
    staffIds,
    dateKey,
    slotIso: zonedWallTimeToUtc(dateKey, 600).toISOString(),
    cleanup: async () => {
      // Bookings reference Service/Staff with Restrict, so remove them first; the
      // rest of the business tree cascades from Business.
      await db.booking.deleteMany({ where: { businessId: business.id } });
      await db.business.delete({ where: { id: business.id } });
      await db.user.delete({ where: { id: owner.id } });
    },
  };
}

/** A random, valid Cyprus mobile (8 digits after +357). */
export function randomPhone(): string {
  return `+3579${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
}

/** Fully parsed booking input, exactly what the server action hands to createBookingRecord. */
export function bookingInput(
  fx: Fixture,
  o: { staffId: string; idempotencyKey?: string; startsAt?: string },
): ParsedBookingInput {
  return bookingInputSchema.parse({
    businessSlug: fx.slug,
    serviceId: fx.serviceId,
    staffId: o.staffId,
    startsAt: o.startsAt ?? fx.slotIso,
    locale: 'en',
    idempotencyKey: o.idempotencyKey ?? randomUUID(),
    details: {
      name: 'E2E Customer',
      email: `customer-${randomUUID().slice(0, 8)}@e2e.test`,
      phone: randomPhone(),
      note: '',
      consentTerms: true,
      consentMessages: true,
    },
  });
}
