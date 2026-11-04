import { db } from './db';
import { parseSettings } from './settings';
import { type AvailabilityInput, type OpeningHour } from './availability';
import { expandDaysOff } from './days-off';
import { BUSINESS_TZ, addDaysToKey, localDateKey } from './time';

const toHours = (rows: OpeningHour[]): OpeningHour[] =>
  rows.map(({ weekday, opensMin, closesMin, closed }) => ({ weekday, opensMin, closesMin, closed }));

/**
 * FRESH (uncached) DB read for the booking flow: everything the pure engine needs
 * for one service. Unlike getNextSlotIso this is never cached, since the booking
 * page must reflect bookings made seconds ago. Task 4.3 reuses it to re-validate
 * a chosen slot server-side before writing.
 *
 * `staffId`: a specific staff id, or 'any'/undefined for every eligible person.
 * Returns null when the business/service is not bookable.
 */
export async function loadAvailabilityInput(params: {
  businessId: string;
  serviceId: string;
  staffId?: string;
  days: number;
  now?: Date;
  /**
   * Reschedule: a booking whose own row must NOT count as busy, so its current
   * slot reads as free while it is being moved.
   */
  excludeBookingId?: string;
}) {
  const now = params.now ?? new Date();
  const b = await db.business.findUnique({
    where: { id: params.businessId },
    select: {
      settings: true,
      openingHours: true,
      closures: true,
      services: {
        where: { id: params.serviceId, active: true },
        select: {
          durationMin: true,
          bufferMin: true,
          staffLinks: { select: { staffId: true } },
        },
      },
      staff: {
        where: { active: true },
        include: { staffHours: true, daysOff: { select: { fromDate: true, toDate: true } } },
      },
    },
  });
  const service = b?.services[0];
  if (!b || !service) return null;

  const eligible = new Set(service.staffLinks.map((l) => l.staffId));
  const staff = b.staff.filter((s) => eligible.has(s.id));
  if (staff.length === 0) return null;
  // A named staff member must be ACTIVE and eligible; an inactive or unknown one is not bookable (6.5).
  if (params.staffId && params.staffId !== 'any' && !staff.some((s) => s.id === params.staffId)) return null;

  const today = localDateKey(now, BUSINESS_TZ);
  const horizonEnd = new Date(now.getTime() + (params.days + 2) * 86_400_000);
  const range = { gte: now };
  const [bookings, blocks] = await Promise.all([
    db.booking.findMany({
      where: {
        businessId: params.businessId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        ...(params.excludeBookingId ? { id: { not: params.excludeBookingId } } : {}),
        endsAt: range,
        startsAt: { lte: horizonEnd },
      },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
    db.block.findMany({
      where: { businessId: params.businessId, endsAt: range, startsAt: { lte: horizonEnd } },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const settings = parseSettings(b.settings);
  const input: AvailabilityInput = {
    now,
    timezone: BUSINESS_TZ,
    settings,
    service: { durationMin: service.durationMin, bufferMin: service.bufferMin },
    staff: staff.map((s) => ({
      id: s.id,
      hours: s.staffHours.length ? toHours(s.staffHours) : undefined,
      daysOff: expandDaysOff(
        s.daysOff.map((d) => ({ from: d.fromDate, to: d.toDate })),
        today,
        params.days,
      ),
    })),
    openingHours: toHours(b.openingHours),
    closures: b.closures.map((c) => ({ from: c.fromDate, to: c.toDate })),
    bookings,
    blocks,
    fromDateKey: today,
    days: params.days,
    staffId: params.staffId && params.staffId !== 'any' ? params.staffId : undefined,
  };
  return { input, lastDateKey: addDaysToKey(today, params.days - 1) };
}
