/**
 * DB-backed tests for the owner bookings table (task 6.3, req 3.3 / 5.1): filters, search,
 * pagination, tenant isolation, empty-state queries and the transition entry point. Real
 * Postgres; calls the lib query/cores directly (the 'use server' wrapper needs a session).
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { BookingStatus } from '@prisma/client';
import { db } from '../lib/db';
import { allowedTransitions } from '../lib/booking-status';
import { changeBookingStatusCore } from '../lib/booking-status-change';
import { countAllBookings, loadBookingsPage } from '../lib/bookings-data';
import { PAGE_SIZE, parseBookingsParams } from '../lib/bookings-params';
import { generateReference } from '../lib/reference';
import { zonedWallTimeToUtc } from '../lib/time';
import { createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test.beforeEach(async () => {
  fx = await createFixture(2);
  other = await createFixture(1);
  ownerId = (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).ownerId;
});
test.afterEach(async () => {
  await db.auditLog.deleteMany({
    where: { businessId: { in: [fx.businessId, other.businessId] } },
  });
  await fx.cleanup();
  await other.cleanup();
});

interface Seed {
  f?: Fixture;
  staffIdx?: number;
  name?: string | null;
  phone?: string | null;
  status?: BookingStatus;
  startsAt: Date;
  createdAt?: Date;
  source?: 'ONLINE' | 'MANUAL';
}
async function seed(o: Seed) {
  const f = o.f ?? fx;
  return db.booking.create({
    data: {
      reference: generateReference(),
      businessId: f.businessId,
      serviceId: f.serviceId,
      staffId: f.staffIds[o.staffIdx ?? 0]!,
      guestName: o.name === undefined ? 'Walk In' : o.name,
      guestPhone: o.phone === undefined ? null : o.phone,
      startsAt: o.startsAt,
      endsAt: new Date(o.startsAt.getTime() + HOUR),
      status: o.status ?? 'CONFIRMED',
      priceCents: 3000,
      source: o.source ?? 'ONLINE',
      manageTokenHash: randomUUID(),
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
  });
}
const q = (raw: Record<string, string>, f = fx) =>
  loadBookingsPage(f.businessId, parseBookingsParams(raw), 'en');
const names = (r: { rows: Array<{ guestName: string | null }> }) =>
  r.rows.map((x) => x.guestName);

test.describe('filters', () => {
  test('status, date range, staff and text search narrow results; other businesses never leak', async () => {
    const now = Date.now();
    await seed({ name: 'Anna Karenina', phone: '+35799123456', startsAt: new Date(now + 2 * DAY) });
    await seed({
      name: 'Bob Pending',
      status: 'PENDING',
      staffIdx: 1,
      startsAt: new Date(now + 3 * DAY),
    });
    await seed({ name: 'Cleo Done', status: 'COMPLETED', startsAt: new Date(now - 2 * DAY) });
    await seed({
      name: 'Dina Cancelled',
      status: 'CANCELLED_BY_CUSTOMER',
      startsAt: new Date(now + 4 * DAY),
    });
    await seed({
      name: 'Eve Cancelled',
      status: 'CANCELLED_BY_BUSINESS',
      startsAt: new Date(now + 5 * DAY),
    });
    await seed({ name: 'Finn Missed', status: 'NO_SHOW', startsAt: new Date(now - 3 * DAY) });
    await seed({ name: 'Past Confirmed', startsAt: new Date(now - 5 * DAY) });
    // Another business: same names / phone / dates, must never appear.
    await seed({ f: other, name: 'Anna Karenina', phone: '+35799123456', startsAt: new Date(now + 2 * DAY) });
    await seed({ f: other, name: 'Zed Other', status: 'COMPLETED', startsAt: new Date(now - 2 * DAY) });

    // Default: upcoming = PENDING + CONFIRMED from now, soonest first.
    expect(names(await q({}))).toEqual(['Anna Karenina', 'Bob Pending']);
    expect(names(await q({ status: 'pending' }))).toEqual(['Bob Pending']);
    expect(names(await q({ status: 'confirmed' }))).toEqual(['Anna Karenina', 'Past Confirmed']);
    expect(names(await q({ status: 'completed' }))).toEqual(['Cleo Done']);
    expect((await q({ status: 'cancelled' })).total).toBe(2);
    expect(names(await q({ status: 'no-show' }))).toEqual(['Finn Missed']);
    const all = await q({ status: 'all' });
    expect(all.total).toBe(7);
    expect(names(all)).not.toContain('Zed Other');

    // Staff filter.
    expect(names(await q({ status: 'all', staff: fx.staffIds[1]! }))).toEqual(['Bob Pending']);
    // A staff id from another business matches nothing (and leaks nothing).
    expect((await q({ status: 'all', staff: other.staffIds[0]! })).total).toBe(0);

    // Date range (Nicosia days, end inclusive).
    const day = (offset: number) =>
      new Date(now + offset * DAY).toLocaleDateString('sv-SE', { timeZone: 'Europe/Nicosia' });
    expect(
      names(await q({ status: 'all', from: day(-3), to: day(-2) })).sort(),
    ).toEqual(['Cleo Done', 'Finn Missed']);
    expect(names(await q({ status: 'all', from: day(4) })).sort()).toEqual([
      'Dina Cancelled',
      'Eve Cancelled',
    ]);

    // Text search: name (case-insensitive), reference, phone in any spacing; scoped.
    expect(names(await q({ q: 'anna' }))).toEqual(['Anna Karenina']);
    expect(names(await q({ status: 'all', q: '99 123456' }))).toEqual(['Anna Karenina']);
    expect(names(await q({ status: 'all', q: '+357 99123456' }))).toEqual(['Anna Karenina']);
    const ref = all.rows.find((r) => r.guestName === 'Bob Pending')!.reference;
    expect(names(await q({ status: 'all', q: ref.toLowerCase() }))).toEqual(['Bob Pending']);
    expect((await q({ status: 'all', q: 'Zed' })).total).toBe(0);
    // LIKE wildcards in the input are data, not patterns.
    expect((await q({ status: 'all', q: '%' })).total).toBe(0);
    // Combined filters AND together.
    expect((await q({ status: 'completed', q: 'anna' })).total).toBe(0);
  });

  test('date sort: upcoming soonest first, history newest first; created sort is newest booked first', async () => {
    const now = Date.now();
    await seed({ name: 'Later', startsAt: new Date(now + 4 * DAY), createdAt: new Date(now - 3 * DAY) });
    await seed({ name: 'Sooner', startsAt: new Date(now + 2 * DAY), createdAt: new Date(now - 1 * DAY) });
    await seed({ name: 'Old', status: 'COMPLETED', startsAt: new Date(now - 6 * DAY) });
    await seed({ name: 'Recent', status: 'COMPLETED', startsAt: new Date(now - 1 * DAY) });
    expect(names(await q({}))).toEqual(['Sooner', 'Later']);
    expect(names(await q({ status: 'completed' }))).toEqual(['Recent', 'Old']);
    expect(names(await q({ status: 'confirmed' }))).toEqual(['Later', 'Sooner']);
    expect(names(await q({ status: 'confirmed', sort: 'created' }))).toEqual(['Sooner', 'Later']);
  });
});

test.describe('pagination', () => {
  test('serves the right slice, total and page count; clamps an out-of-range page', async () => {
    const base = zonedWallTimeToUtc(fx.dateKey, 0).getTime() - 40 * DAY;
    for (let i = 0; i < PAGE_SIZE + 5; i++)
      await seed({
        name: `P${String(i).padStart(2, '0')}`,
        status: 'COMPLETED',
        startsAt: new Date(base + i * HOUR * 2),
      });
    const p1 = await q({ status: 'all' });
    expect(p1).toMatchObject({ total: 25, page: 1, pageCount: 2 });
    expect(p1.rows).toHaveLength(PAGE_SIZE);
    // History is newest first: P24 down to P05 on page 1, P04..P00 on page 2.
    expect(p1.rows[0]!.guestName).toBe('P24');
    const p2 = await q({ status: 'all', page: '2' });
    expect(names(p2)).toEqual(['P04', 'P03', 'P02', 'P01', 'P00']);
    expect(new Set([...names(p1), ...names(p2)]).size).toBe(25);
    const clamped = await q({ status: 'all', page: '99' });
    expect(clamped.page).toBe(2);
    expect(clamped.rows).toHaveLength(5);
  });
});

test.describe('transitions from the table', () => {
  test('only allowed transitions succeed; another business cannot use this entry point; audit holds ids only', async () => {
    const now = Date.now();
    const pending = await seed({
      name: 'ZZPII Pending',
      status: 'PENDING',
      startsAt: new Date(now + 2 * DAY),
    });
    const done = await seed({ status: 'COMPLETED', startsAt: new Date(now - 2 * DAY) });
    const row = (await q({ status: 'all' })).rows.find((r) => r.id === pending.id)!;
    // The UI offers exactly what the table allows for the row's status.
    expect([...allowedTransitions(row.status as 'PENDING')]).toEqual([
      'CONFIRMED',
      'CANCELLED_BY_BUSINESS',
    ]);
    expect(allowedTransitions('COMPLETED')).toEqual([]);

    // A terminal row rejects every target.
    for (const to of ['CONFIRMED', 'NO_SHOW', 'CANCELLED_BY_BUSINESS'])
      expect(await changeBookingStatusCore(ownerId, fx.businessId, done.id, to)).toMatchObject({
        ok: false,
        code: 'NOT_ALLOWED',
      });

    // Another business's owner cannot change this row, with their own or this business id.
    const intruder = (await db.business.findUniqueOrThrow({ where: { id: other.businessId } })).ownerId;
    expect(await changeBookingStatusCore(intruder, fx.businessId, pending.id, 'CONFIRMED')).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await changeBookingStatusCore(intruder, other.businessId, pending.id, 'CONFIRMED')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING');

    // Allowed: confirm, and the row moves between filtered views.
    expect(await changeBookingStatusCore(ownerId, fx.businessId, pending.id, 'CONFIRMED')).toMatchObject({
      ok: true,
    });
    expect((await q({ status: 'pending' })).total).toBe(0);
    expect(names(await q({ status: 'confirmed' }))).toContain('ZZPII Pending');

    const audit = await db.auditLog.findMany({ where: { businessId: fx.businessId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: ownerId, action: 'booking.status' });
    expect(audit[0]!.meta).toEqual({ bookingId: pending.id, from: 'PENDING', to: 'CONFIRMED' });
    expect(JSON.stringify(audit[0]!.meta)).not.toContain('ZZPII');
  });
});

test.describe('empty states', () => {
  test('a business with no bookings reports zero; filters on a populated business report zero; counts are per business', async () => {
    expect(await countAllBookings(fx.businessId)).toBe(0);
    expect(await q({})).toMatchObject({ total: 0, rows: [], page: 1, pageCount: 1 });

    await seed({ f: other, startsAt: new Date(Date.now() + 2 * DAY) });
    expect(await countAllBookings(fx.businessId)).toBe(0);
    expect(await countAllBookings(other.businessId)).toBe(1);

    // Populated but nothing upcoming: default view is empty, "all" is not.
    await seed({ status: 'COMPLETED', startsAt: new Date(Date.now() - 2 * DAY) });
    expect((await q({})).total).toBe(0);
    expect(await countAllBookings(fx.businessId)).toBe(1);
    expect((await q({ status: 'all' })).total).toBe(1);
    expect((await q({ status: 'all', q: 'nobody-by-this-name' })).total).toBe(0);
  });
});
