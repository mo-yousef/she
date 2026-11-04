/**
 * DB-backed tests for the hours editor cores (task 6.6, req 5.1 / 4.2). Real Postgres; the lib
 * cores behind the 'use server' wrappers are called directly with explicit user ids (same
 * approach as team.spec.ts). No browser, no email chain.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { BookingStatus } from '@prisma/client';
import { db } from '../lib/db';
import { computeAvailability } from '../lib/availability';
import { createBookingRecord } from '../lib/booking';
import { loadAvailabilityInput } from '../lib/booking-availability';
import { addClosureCore, loadHoursForDashboard, removeClosureCore, saveBusinessHoursCore } from '../lib/business-hours';
import { isOpenNow } from '../lib/hours';
import { generateReference } from '../lib/reference';
import { createStaffCore } from '../lib/team';
import { addDaysToKey, zonedWallTimeToUtc } from '../lib/time';
import { bookingInput, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
let otherOwnerId: string;
const HOUR = 3_600_000;
const SECRET_REASON = 'Secret surgery reason 4417';

test.beforeEach(async () => {
  fx = await createFixture(2);
  other = await createFixture(1);
  ownerId = (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).ownerId;
  otherOwnerId = (await db.business.findUniqueOrThrow({ where: { id: other.businessId } })).ownerId;
});
test.afterEach(async () => {
  await db.auditLog.deleteMany({ where: { businessId: { in: [fx.businessId, other.businessId] } } });
  await fx.cleanup();
  await other.cleanup();
});

type Day = { weekday: number; closed: boolean; opensMin: number; closesMin: number };
/** Fixture hours are 09:00-18:00 every day. */
const days = (over: Record<number, Partial<Day>> = {}): Day[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: false, opensMin: 540, closesMin: 1080, ...over[weekday] }));
const CLOSED = { closed: true, opensMin: 0, closesMin: 0 };
const save = (d: Day[] = days(), who: string | null = ownerId, biz = fx.businessId, now?: Date) => saveBusinessHoursCore(who, biz, { days: d }, now);
const storedHours = async (businessId = fx.businessId) =>
  (await db.openingHours.findMany({ where: { businessId }, orderBy: { weekday: 'asc' }, select: { weekday: true, closed: true, opensMin: true, closesMin: true } }));

async function seedBooking(startsAt: Date, status: BookingStatus = 'CONFIRMED', staffId = fx.staffIds[0]!) {
  return db.booking.create({
    data: {
      reference: generateReference(),
      businessId: fx.businessId,
      serviceId: fx.serviceId,
      staffId,
      guestName: 'Walk In',
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      status,
      priceCents: 3000,
      manageTokenHash: randomUUID(),
    },
  });
}
const slotsOn = async (dateKey: string, staffId?: string) => {
  const loaded = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId, days: 6 });
  return { loaded, slots: computeAvailability(loaded!.input).find((d) => d.dateKey === dateKey)!.slots };
};

// ---- (a) save / validation / auth ----------------------------------------------------------
test('save writes all 7 rows; invalid input writes nothing; auth is enforced', async () => {
  const r = await save(days({ 1: { opensMin: 600, closesMin: 900 }, 0: CLOSED }));
  expect(r).toMatchObject({ ok: true, adjustedStaff: 0, outsideBookings: 0, warnings: [] });
  const rows = await storedHours();
  expect(rows).toHaveLength(7);
  expect(rows.find((x) => x.weekday === 1)).toMatchObject({ opensMin: 600, closesMin: 900, closed: false });
  expect(rows.find((x) => x.weekday === 0)).toMatchObject({ closed: true, opensMin: 0, closesMin: 0 });

  const before = await storedHours();
  const auditBefore = await db.auditLog.count({ where: { businessId: fx.businessId } });
  const bad: Array<[Day[], Record<string, string>]> = [
    [days({ 2: { opensMin: 600, closesMin: 600 } }), { 'day-2': 'closeBeforeOpen' }],
    [days({ 3: { opensMin: 600, closesMin: 500 } }), { 'day-3': 'closeBeforeOpen' }],
    [days({ 4: { closesMin: 1441 } }), { 'day-4': 'range' }],
    [days({ 5: { opensMin: -1 } }), { 'day-5': 'range' }],
    [days().slice(0, 6), { form: 'weekdays' }],
  ];
  for (const [d, errors] of bad) expect(await save(d)).toMatchObject({ ok: false, code: 'VALIDATION', errors });
  expect(await saveBusinessHoursCore(ownerId, fx.businessId, null)).toMatchObject({ ok: false, code: 'VALIDATION' });
  expect(await storedHours()).toEqual(before);
  expect(await db.auditLog.count({ where: { businessId: fx.businessId } })).toBe(auditBefore);

  expect(await save(days(), otherOwnerId)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await save(days(), null)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  expect(await storedHours()).toEqual(before);
});

test('an all-closed week is saved with a NO_OPEN_DAYS warning for a live listing', async () => {
  const all = days();
  for (const d of all) Object.assign(d, CLOSED);
  expect(await save(all)).toMatchObject({ ok: true, warnings: ['NO_OPEN_DAYS'] });
  expect((await storedHours()).every((r) => r.closed)).toBe(true);
  await db.business.update({ where: { id: fx.businessId }, data: { status: 'DRAFT' } });
  expect(await save(all)).toMatchObject({ ok: true, warnings: [] });
});

// ---- (b) staff clamp ----------------------------------------------------------------------
test('narrowing business hours clamps staff overrides; widening leaves them alone', async () => {
  const created = await createStaffCore(ownerId, fx.businessId, {
    name: 'Clamp Person',
    role: 'Colourist',
    active: true,
    serviceIds: [fx.serviceId],
    hours: days({ 3: { opensMin: 600, closesMin: 1020 }, 5: { opensMin: 600, closesMin: 700 } }),
  });
  if (!created.ok) throw new Error(created.code);
  const staffId = created.staffId;

  // Wednesday narrows to 11:00-15:00, Sunday closes, Friday narrows to 12:00-18:00 (empty overlap with 10:00-11:40).
  const r = await save(days({ 3: { opensMin: 660, closesMin: 900 }, 0: CLOSED, 5: { opensMin: 720 } }));
  expect(r).toMatchObject({ ok: true, adjustedStaff: 1 });
  const hours = await db.staffHours.findMany({ where: { staffId }, orderBy: { weekday: 'asc' } });
  const at = (w: number) => hours.find((h) => h.weekday === w)!;
  expect(hours).toHaveLength(7);
  expect(at(3)).toMatchObject({ closed: false, opensMin: 660, closesMin: 900 });
  expect(at(0)).toMatchObject({ closed: true });
  expect(at(5)).toMatchObject({ closed: true });
  expect(at(1)).toMatchObject({ closed: false, opensMin: 540, closesMin: 1080 }); // unchanged (inside new hours)

  const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: fx.businessId, action: 'staff.hours.clamp' } });
  expect(audit.meta).toEqual({ staffIds: [staffId], fields: ['hours'] });

  // Widening back: the clamped override is NOT widened.
  const again = await save(days());
  expect(again).toMatchObject({ ok: true, adjustedStaff: 0 });
  expect(at(3)).toMatchObject({ opensMin: 660, closesMin: 900 });
  expect((await db.staffHours.findMany({ where: { staffId, weekday: 3 } }))[0]).toMatchObject({ opensMin: 660, closesMin: 900 });
});

// ---- (c) closure honoured everywhere -------------------------------------------------------
test('closure removes slots, rejects bookings, and removing restores them', async () => {
  expect((await slotsOn(fx.dateKey)).slots.length).toBeGreaterThan(0);
  const added = await addClosureCore(ownerId, fx.businessId, { fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 1), reason: SECRET_REASON });
  if (!added.ok) throw new Error(added.code);
  expect((await slotsOn(fx.dateKey)).slots).toEqual([]);
  expect((await slotsOn(addDaysToKey(fx.dateKey, 1))).slots).toEqual([]);
  expect((await slotsOn(addDaysToKey(fx.dateKey, 2))).slots.length).toBeGreaterThan(0);
  expect(await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) })).toMatchObject({ ok: false, code: 'SLOT_TAKEN' });
  expect(await createBookingRecord({ input: bookingInput(fx, { staffId: 'any' }) })).toMatchObject({ ok: false, code: 'SLOT_TAKEN' });
  expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(0);

  expect(await removeClosureCore(ownerId, fx.businessId, added.closureId)).toMatchObject({ ok: true });
  expect((await slotsOn(fx.dateKey)).slots.length).toBeGreaterThan(0);
  expect(await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) })).toMatchObject({ ok: true });
});

test('remove: cross-tenant and unknown ids are NOT_FOUND; other owners are FORBIDDEN', async () => {
  const mine = await addClosureCore(ownerId, fx.businessId, { fromDate: fx.dateKey, toDate: fx.dateKey });
  const theirs = await addClosureCore(otherOwnerId, other.businessId, { fromDate: fx.dateKey, toDate: fx.dateKey });
  if (!mine.ok || !theirs.ok) throw new Error('setup');
  expect(await removeClosureCore(ownerId, fx.businessId, theirs.closureId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await removeClosureCore(ownerId, fx.businessId, 'nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await removeClosureCore(otherOwnerId, fx.businessId, mine.closureId)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await removeClosureCore(null, fx.businessId, mine.closureId)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  expect(await addClosureCore(otherOwnerId, fx.businessId, { fromDate: fx.dateKey, toDate: fx.dateKey })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await db.closure.count({ where: { id: { in: [mine.closureId, theirs.closureId] } } })).toBe(2);
});

// ---- (d) closure vs bookings ---------------------------------------------------------------
test('closure over a future active booking is refused with count and dates; cancelled do not count', async () => {
  await seedBooking(new Date(fx.slotIso));
  const nextDay = addDaysToKey(fx.dateKey, 1);
  await seedBooking(zonedWallTimeToUtc(nextDay, 600), 'CANCELLED_BY_BUSINESS');
  const r = await addClosureCore(ownerId, fx.businessId, { fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 2), reason: SECRET_REASON });
  expect(r).toMatchObject({ ok: false, code: 'HAS_BOOKINGS', futureCount: 1, conflictDates: [fx.dateKey] });
  expect(await db.closure.count({ where: { businessId: fx.businessId } })).toBe(0);
  expect(await addClosureCore(ownerId, fx.businessId, { fromDate: nextDay, toDate: addDaysToKey(fx.dateKey, 2) })).toMatchObject({ ok: true });
});

test('closure bounds are local-midnight and DST-safe', async () => {
  // Nicosia clocks go forward on 2027-03-28. A booking 23:00-24:00 local that day clashes with a
  // closure on the 28th but not with one starting the 29th.
  const now = new Date('2027-03-20T00:00:00Z');
  await seedBooking(zonedWallTimeToUtc('2027-03-28', 1380));
  expect(await addClosureCore(ownerId, fx.businessId, { fromDate: '2027-03-29', toDate: '2027-03-30' }, now)).toMatchObject({ ok: true });
  expect(await addClosureCore(ownerId, fx.businessId, { fromDate: '2027-03-28', toDate: '2027-03-28' }, now)).toMatchObject({
    ok: false,
    code: 'HAS_BOOKINGS',
    conflictDates: ['2027-03-28'],
  });
});

// ---- (e) race ------------------------------------------------------------------------------
test('race: closure creation vs an online booking on that date: exactly one wins, nothing stranded', async () => {
  for (let i = 0; i < 5; i++) {
    const f = await createFixture(1);
    try {
      const owner = (await db.business.findUniqueOrThrow({ where: { id: f.businessId } })).ownerId;
      const staffId = f.staffIds[0]!;
      const [closure, book] = await Promise.allSettled([
        addClosureCore(owner, f.businessId, { fromDate: f.dateKey, toDate: f.dateKey }),
        createBookingRecord({ input: bookingInput(f, { staffId }) }),
      ]);
      expect(closure.status).toBe('fulfilled');
      expect(book.status).toBe('fulfilled');
      if (closure.status !== 'fulfilled' || book.status !== 'fulfilled') continue;
      const bookings = await db.booking.count({ where: { businessId: f.businessId } });
      const closures = await db.closure.count({ where: { businessId: f.businessId } });
      if (book.value.ok) {
        expect(closure.value).toMatchObject({ ok: false, code: 'HAS_BOOKINGS', futureCount: 1 });
        expect(bookings).toBe(1);
        expect(closures).toBe(0);
      } else {
        expect(book.value.code).toBe('SLOT_TAKEN');
        expect(closure.value).toMatchObject({ ok: true });
        expect(bookings).toBe(0);
        expect(closures).toBe(1);
      }
    } finally {
      await db.auditLog.deleteMany({ where: { businessId: f.businessId } });
      await f.cleanup();
    }
  }
});

// ---- (f) weekly hours vs existing bookings --------------------------------------------------
test('hours changes keep existing bookings and report how many fall outside', async () => {
  const kept = await seedBooking(new Date(fx.slotIso)); // 10:00-11:00 local
  await seedBooking(new Date(fx.slotIso), 'CANCELLED_BY_BUSINESS', fx.staffIds[1]!);
  const past = await seedBooking(new Date(Date.now() - 3 * 24 * HOUR), 'COMPLETED');
  const weekdayOfSlot = (await db.booking.findUniqueOrThrow({ where: { id: kept.id } })).startsAt;
  expect(weekdayOfSlot.toISOString()).toBe(fx.slotIso);

  const r = await save(days(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((w) => [w, { opensMin: 720 }]))));
  expect(r).toMatchObject({ ok: true, outsideBookings: 1 });
  const still = await db.booking.findMany({ where: { businessId: fx.businessId, status: { in: ['CONFIRMED', 'COMPLETED'] } } });
  expect(still.map((b) => b.id).sort()).toEqual([kept.id, past.id].sort());
  // A closed slot day for just that weekday also counts it.
  const slotWeekday = zonedWeekday(fx.dateKey);
  expect(await save(days({ [slotWeekday]: CLOSED }))).toMatchObject({ ok: true, outsideBookings: 1 });
  expect(await save(days())).toMatchObject({ ok: true, outsideBookings: 0 });
});
function zonedWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

// ---- (g) closure validation ----------------------------------------------------------------
test('closure range validation', async () => {
  const bad = (v: Record<string, unknown>) => addClosureCore(ownerId, fx.businessId, v);
  expect(await bad({ fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, -1) })).toMatchObject({ ok: false, errors: { toDate: 'toBeforeFrom' } });
  expect(await bad({ fromDate: addDaysToKey(fx.dateKey, -10), toDate: addDaysToKey(fx.dateKey, -9) })).toMatchObject({ ok: false, errors: { toDate: 'inPast' } });
  expect(await bad({ fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 366) })).toMatchObject({ ok: false, errors: { toDate: 'tooLong' } });
  expect(await bad({ fromDate: 'nope', toDate: fx.dateKey })).toMatchObject({ ok: false, code: 'VALIDATION' });
  expect(await bad({ fromDate: fx.dateKey, toDate: fx.dateKey, reason: 'x'.repeat(121) })).toMatchObject({ ok: false, errors: { reason: 'reasonTooLong' } });
  expect(await db.closure.count({ where: { businessId: fx.businessId } })).toBe(0);
  expect(await bad({ fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 365) })).toMatchObject({ ok: true });

  await db.closure.createMany({ data: Array.from({ length: 199 }, () => ({ businessId: fx.businessId, fromDate: '2099-01-01', toDate: '2099-01-02' })) });
  expect(await bad({ fromDate: '2098-01-01', toDate: '2098-01-02' })).toMatchObject({ ok: false, errors: { form: 'tooMany' } });
});

// ---- (h) audit ------------------------------------------------------------------------------
test('audit rows carry ids and field names only', async () => {
  await save(days({ 1: { opensMin: 601, closesMin: 977 } }));
  const added = await addClosureCore(ownerId, fx.businessId, { fromDate: fx.dateKey, toDate: fx.dateKey, reason: SECRET_REASON });
  if (!added.ok) throw new Error(added.code);
  await removeClosureCore(ownerId, fx.businessId, added.closureId);
  const rows = await db.auditLog.findMany({ where: { businessId: fx.businessId } });
  expect(rows.map((r) => r.action).sort()).toEqual(['business.hours', 'closure.add', 'closure.remove']);
  for (const r of rows) {
    const text = JSON.stringify(r.meta);
    expect(text).not.toContain(SECRET_REASON);
    expect(text).not.toMatch(/601|977/);
    expect(Object.keys(r.meta as object).every((k) => ['closureId', 'staffIds', 'fields'].includes(k))).toBe(true);
  }
});

// ---- (i) open-now agrees with the loader ---------------------------------------------------
test('isOpenNow agrees with the DB-backed loaders on a closure day', async () => {
  const at = zonedWallTimeToUtc(fx.dateKey, 600);
  const added = await addClosureCore(ownerId, fx.businessId, { fromDate: fx.dateKey, toDate: fx.dateKey });
  if (!added.ok) throw new Error(added.code);
  const closed = await slotsOn(fx.dateKey);
  expect(closed.slots).toEqual([]);
  expect(isOpenNow(closed.loaded!.input.openingHours, closed.loaded!.input.closures, at)).toBe(false);
  const page = await loadHoursForDashboard(fx.businessId, new Date(at.getTime() - 24 * HOUR));
  expect(page.closures.map((c) => c.id)).toEqual([added.closureId]);
  expect(isOpenNow(page.days, page.closures.map((c) => ({ from: c.fromDate, to: c.toDate })), at)).toBe(false);

  await removeClosureCore(ownerId, fx.businessId, added.closureId);
  const open = await slotsOn(fx.dateKey);
  expect(open.slots.length).toBeGreaterThan(0);
  expect(isOpenNow(open.loaded!.input.openingHours, open.loaded!.input.closures, at)).toBe(true);
});
