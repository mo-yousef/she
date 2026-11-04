/**
 * Server-side loader for the dashboard calendar page (task 6.2). Reads the owner's own
 * business only (the caller passes the id from `requireOwnerBusiness`), runs the pure
 * layout, and returns plain serialisable DTOs for the client grid.
 */
import { db } from './db';
import type { OpeningHour } from './availability';
import { buildColumns, type Axis } from './calendar-layout';
import { visibleDateKeys, type CalendarParams } from './calendar-params';
import { formatTime } from './format-datetime';
import { parseSettings } from './settings';
import { addDaysToKey, zonedWallTimeToUtc } from './time';

export interface EventDto {
  id: string;
  kind: 'booking' | 'block';
  staffId: string;
  staffName: string;
  startIso: string;
  endIso: string;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
  timeLabel: string;
  /** Booking: service name. Block: reason (may be empty). */
  title: string;
  status?: string;
  reference?: string;
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  note?: string | null;
  priceCents?: number;
  source?: string;
}

export interface ColumnDto {
  key: string;
  staffId: string;
  dateKey: string;
  closed: Array<{ startMin: number; endMin: number }>;
  events: EventDto[];
}

export interface ServiceOption {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  staffIds: string[];
}

export interface CalendarData {
  axis: Axis;
  columns: ColumnDto[];
  staff: Array<{ id: string; name: string }>;
  services: ServiceOption[];
  slotIntervalMin: number;
  /** Staff id used by week view (and as the default for forms). */
  activeStaffId: string | null;
}

const toHours = (rows: OpeningHour[]): OpeningHour[] =>
  rows.map(({ weekday, opensMin, closesMin, closed }) => ({
    weekday,
    opensMin,
    closesMin,
    closed,
  }));

export async function loadCalendarData(
  businessId: string,
  p: CalendarParams,
  locale: string,
): Promise<CalendarData> {
  const keys = visibleDateKeys(p.view, p.dateKey);
  const from = zonedWallTimeToUtc(keys[0]!, 0);
  const to = zonedWallTimeToUtc(addDaysToKey(keys[keys.length - 1]!, 1), 0);

  const b = await db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      settings: true,
      openingHours: true,
      closures: true,
      staff: {
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { staffHours: true, daysOff: { select: { fromDate: true, toDate: true } } },
      },
      services: {
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
          staffLinks: { select: { staffId: true } },
        },
      },
    },
  });
  const staff = b.staff;
  const activeStaff =
    staff.find((s) => s.id === p.staffId) ?? (p.view === 'week' ? staff[0] : undefined);
  const shown =
    p.view === 'week'
      ? activeStaff
        ? [activeStaff]
        : []
      : activeStaff
        ? [activeStaff]
        : staff;
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const shownIds = shown.map((s) => s.id);

  const [bookings, blocks] = await Promise.all([
    db.booking.findMany({
      where: {
        businessId,
        staffId: { in: shownIds },
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(p.showCancelled
          ? {}
          : { status: { notIn: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_BUSINESS'] } }),
      },
      select: {
        id: true,
        staffId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        reference: true,
        guestName: true,
        guestPhone: true,
        guestEmail: true,
        note: true,
        priceCents: true,
        source: true,
        service: { select: { name: true } },
      },
    }),
    db.block.findMany({
      where: {
        businessId,
        staffId: { in: shownIds },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { id: true, staffId: true, startsAt: true, endsAt: true, reason: true },
    }),
  ]);

  type Ev = {
    id: string;
    staffId: string;
    startsAt: Date;
    endsAt: Date;
    kind: 'booking' | 'block';
    row: (typeof bookings)[number] | (typeof blocks)[number];
  };
  const events: Ev[] = [
    ...bookings.map((r): Ev => ({
      id: r.id,
      staffId: r.staffId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      kind: 'booking',
      row: r,
    })),
    ...blocks.map((r): Ev => ({
      id: r.id,
      staffId: r.staffId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      kind: 'block',
      row: r,
    })),
  ];

  const openingHours = toHours(b.openingHours);
  const toCal = (s: (typeof staff)[number]) => ({
    id: s.id,
    name: s.name,
    hours: s.staffHours.length ? toHours(s.staffHours) : undefined,
    daysOff: s.daysOff.map((d) => ({ from: d.fromDate, to: d.toDate })),
  });
  const { axis, columns } = buildColumns({
    view: p.view,
    dateKey: p.dateKey,
    staff: shown.map(toCal),
    axisStaff: staff.map(toCal),
    openingHours,
    closures: b.closures.map((c) => ({ from: c.fromDate, to: c.toDate })),
    events,
  });

  return {
    axis,
    columns: columns.map((c) => ({
      key: c.key,
      staffId: c.staffId,
      dateKey: c.dateKey,
      closed: c.closed,
      events: c.events.map((pl): EventDto => {
        const e = pl.item;
        const startIso = e.startsAt.toISOString();
        const endIso = e.endsAt.toISOString();
        const base = {
          id: e.id,
          kind: e.kind,
          staffId: e.staffId,
          staffName: staffName.get(e.staffId) ?? '',
          startIso,
          endIso,
          startMin: pl.startMin,
          endMin: pl.endMin,
          lane: pl.lane,
          lanes: pl.lanes,
          timeLabel: `${formatTime(startIso, locale)}–${formatTime(endIso, locale)}`,
        };
        if (e.kind === 'block') {
          const r = e.row as (typeof blocks)[number];
          return { ...base, title: r.reason ?? '' };
        }
        const r = e.row as (typeof bookings)[number];
        return {
          ...base,
          title: r.service.name,
          status: r.status,
          reference: r.reference,
          guestName: r.guestName,
          guestPhone: r.guestPhone,
          guestEmail: r.guestEmail,
          note: r.note,
          priceCents: r.priceCents,
          source: r.source,
        };
      }),
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name })),
    services: b.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      staffIds: s.staffLinks.map((l) => l.staffId),
    })),
    slotIntervalMin: parseSettings(b.settings).slotIntervalMin,
    activeStaffId: activeStaff?.id ?? staff[0]?.id ?? null,
  };
}
