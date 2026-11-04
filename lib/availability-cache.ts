import { unstable_cache } from 'next/cache';
import { db } from './db';
import { parseSettings } from './settings';
import { computeAvailability, type OpeningHour } from './availability';
import { expandDaysOff } from './days-off';
import { BUSINESS_TZ, localDateKey } from './time';
import {
  NEXT_SLOT_REVALIDATE_SECONDS,
  NEXT_SLOT_SCAN_DAYS,
  availabilityTag,
  nextSlotKeyParts,
  pickNextSlotIso,
} from './next-slot';

/**
 * Uncached: reads staff/hours/bookings/blocks for ONE business and runs the pure
 * engine for its cheapest active service. Returns an ISO string (JSON-safe for the
 * data cache) or null.
 */
async function computeNextSlotIso(businessId: string): Promise<string | null> {
  const now = new Date();

  const b = await db.business.findUnique({
    where: { id: businessId },
    select: {
      settings: true,
      openingHours: true,
      closures: true,
      services: {
        where: { active: true },
        orderBy: { priceCents: 'asc' },
        take: 1,
        select: { durationMin: true, bufferMin: true, staffLinks: { select: { staffId: true } } },
      },
      staff: {
        where: { active: true },
        include: { staffHours: true, daysOff: { select: { fromDate: true, toDate: true } } },
      },
    },
  });

  const service = b?.services[0];
  if (!b || !service) return null;

  // Only staff who actually perform the representative service.
  const eligible = new Set(service.staffLinks.map((l) => l.staffId));
  const staff = b.staff.filter((s) => eligible.has(s.id));
  if (staff.length === 0) return null;

  const [bookings, blocks] = await Promise.all([
    db.booking.findMany({
      where: { businessId, status: { in: ['PENDING', 'CONFIRMED'] }, endsAt: { gte: now } },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
    db.block.findMany({
      where: { businessId, endsAt: { gte: now } },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const toHours = (rows: OpeningHour[]): OpeningHour[] =>
    rows.map(({ weekday, opensMin, closesMin, closed }) => ({ weekday, opensMin, closesMin, closed }));

  const fromDateKey = localDateKey(now, BUSINESS_TZ);
  const days = computeAvailability({
    now,
    timezone: BUSINESS_TZ,
    settings: parseSettings(b.settings),
    service: { durationMin: service.durationMin, bufferMin: service.bufferMin },
    staff: staff.map((s) => ({
      id: s.id,
      hours: s.staffHours.length ? toHours(s.staffHours) : undefined,
      daysOff: expandDaysOff(
        s.daysOff.map((d) => ({ from: d.fromDate, to: d.toDate })),
        fromDateKey,
        NEXT_SLOT_SCAN_DAYS,
      ),
    })),
    openingHours: toHours(b.openingHours),
    closures: b.closures.map((c) => ({ from: c.fromDate, to: c.toDate })),
    bookings,
    blocks,
    fromDateKey,
    days: NEXT_SLOT_SCAN_DAYS,
  });

  return pickNextSlotIso(days);
}

/**
 * Cached next-available slot for a business card. Keyed by business id + local
 * date, revalidated every few minutes, and tagged `business:{id}:availability`
 * so owner edits / bookings can call `revalidateTag(availabilityTag(id))`.
 */
export function getNextSlotIso(businessId: string): Promise<string | null> {
  const dateKey = localDateKey(new Date(), BUSINESS_TZ);
  return unstable_cache(() => computeNextSlotIso(businessId), nextSlotKeyParts(businessId, dateKey), {
    revalidate: NEXT_SLOT_REVALIDATE_SECONDS,
    tags: [availabilityTag(businessId)],
  })();
}
