/**
 * Server-side loader for the dashboard bookings table (task 6.3). Scoped to the owner's own
 * business id (passed in by the caller from `requireOwnerBusiness` — never from client
 * input). Offset pagination: simplest correct at this scale (Ponytail) — a business runs a
 * few thousand bookings at most and Booking is indexed on (businessId, startsAt), so
 * COUNT + OFFSET stays fast without a cursor. Text search is Prisma `contains` +
 * `mode: insensitive` (parameterised ILIKE), always AND-ed with the business scope.
 */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { addDaysToKey, zonedWallTimeToUtc } from './time';
import { formatSlot, formatTime } from './format-datetime';
import { PAGE_SIZE, escapeLike, searchTerms, type BookingsParams } from './bookings-params';

export interface BookingRow {
  id: string;
  reference: string;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  note: string | null;
  service: string;
  staffId: string;
  staffName: string;
  startIso: string;
  /** "Fri 7 Nov, 14:30" (Europe/Nicosia). */
  dateLabel: string;
  /** "14:30–15:30" (Europe/Nicosia). */
  timeLabel: string;
  priceCents: number;
  status: string;
  source: string;
}

export interface BookingsPage {
  rows: BookingRow[];
  total: number;
  /** The page actually served (clamped to the last page). */
  page: number;
  pageCount: number;
  staff: Array<{ id: string; name: string }>;
}

const ACTIVE = ['PENDING', 'CONFIRMED'] as const;
const CANCELLED = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_BUSINESS'] as const;

/** The Prisma filter for a bookings view. Pure; exported so tests can read it. */
export function buildBookingsWhere(
  businessId: string,
  p: BookingsParams,
  now: Date,
): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = { businessId };
  switch (p.status) {
    case 'upcoming':
      where.status = { in: [...ACTIVE] };
      break;
    case 'pending':
      where.status = 'PENDING';
      break;
    case 'confirmed':
      where.status = 'CONFIRMED';
      break;
    case 'completed':
      where.status = 'COMPLETED';
      break;
    case 'cancelled':
      where.status = { in: [...CANCELLED] };
      break;
    case 'no-show':
      where.status = 'NO_SHOW';
      break;
    case 'all':
      break;
  }

  const startsAt: Prisma.DateTimeFilter = {};
  if (p.status === 'upcoming') startsAt.gte = now;
  if (p.from) {
    const from = zonedWallTimeToUtc(p.from, 0);
    if (!startsAt.gte || from > startsAt.gte) startsAt.gte = from;
  }
  if (p.to) startsAt.lt = zonedWallTimeToUtc(addDaysToKey(p.to, 1), 0);
  if (Object.keys(startsAt).length) where.startsAt = startsAt;

  if (p.staffId) where.staffId = p.staffId;

  const { text, digits } = searchTerms(p.q);
  if (text) {
    where.OR = [
      { guestName: { contains: escapeLike(text), mode: 'insensitive' } },
      { reference: { contains: escapeLike(text), mode: 'insensitive' } },
      ...(digits ? [{ guestPhone: { contains: digits } }] : []),
    ];
  }
  return where;
}

/**
 * "Date" sort: soonest first for the upcoming view, most recent first for every history
 * view (otherwise page 1 of "Completed" would be the oldest visit). "Created": newest first.
 */
function buildOrderBy(p: BookingsParams): Prisma.BookingOrderByWithRelationInput[] {
  if (p.sort === 'created') return [{ createdAt: 'desc' }, { id: 'asc' }];
  return [{ startsAt: p.status === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }];
}

export async function loadBookingsPage(
  businessId: string,
  p: BookingsParams,
  locale: string,
  now: Date = new Date(),
): Promise<BookingsPage> {
  const where = buildBookingsWhere(businessId, p, now);
  const [total, staff] = await Promise.all([
    db.booking.count({ where }),
    db.staffMember.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(p.page, pageCount);

  const rows = await db.booking.findMany({
    where,
    orderBy: buildOrderBy(p),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      reference: true,
      guestName: true,
      guestPhone: true,
      guestEmail: true,
      note: true,
      startsAt: true,
      endsAt: true,
      priceCents: true,
      status: true,
      source: true,
      staffId: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });

  return {
    total,
    page,
    pageCount,
    staff,
    rows: rows.map((r) => {
      const startIso = r.startsAt.toISOString();
      const endIso = r.endsAt.toISOString();
      return {
        id: r.id,
        reference: r.reference,
        guestName: r.guestName,
        guestPhone: r.guestPhone,
        guestEmail: r.guestEmail,
        note: r.note,
        service: r.service.name,
        staffId: r.staffId,
        staffName: r.staff.name,
        startIso,
        dateLabel: formatSlot(startIso, locale),
        timeLabel: `${formatTime(startIso, locale)}–${formatTime(endIso, locale)}`,
        priceCents: r.priceCents,
        status: r.status,
        source: r.source,
      };
    }),
  };
}

/** Counts used by the empty states: every booking this business has ever had. */
export function countAllBookings(businessId: string): Promise<number> {
  return db.booking.count({ where: { businessId } });
}
