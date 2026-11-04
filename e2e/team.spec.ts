/**
 * DB-backed tests for team CRUD, per-staff hours and days off (task 6.5, req 5.1). Real
 * Postgres; the lib cores behind the 'use server' wrappers are called directly with explicit
 * user ids (same approach as services.spec.ts). No browser, no email chain.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { BookingStatus } from '@prisma/client';
import { db } from '../lib/db';
import { computeAvailability } from '../lib/availability';
import { createBookingRecord } from '../lib/booking';
import { loadAvailabilityInput } from '../lib/booking-availability';
import { loadBookingsPage } from '../lib/bookings-data';
import { parseBookingsParams } from '../lib/bookings-params';
import { saveFirstServiceCore } from '../lib/onboarding';
import { generateReference } from '../lib/reference';
import {
  addDayOffCore,
  createStaffCore,
  deleteStaffCore,
  loadTeamForDashboard,
  moveStaffCore,
  removeDayOffCore,
  setStaffActiveCore,
  updateStaffCore,
} from '../lib/team';
import { addDaysToKey } from '../lib/time';
import { bookingInput, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
let otherOwnerId: string;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SECRET_NAME = 'Secret Person Name 7731';
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

const week = (over: Partial<{ closed: boolean; opensMin: number; closesMin: number }> = {}, only?: number) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    closed: false,
    opensMin: 600,
    closesMin: 960,
    ...(only === undefined || only === weekday ? over : {}),
  }));

const input = (over: Record<string, unknown> = {}) => ({
  name: SECRET_NAME,
  role: 'Colourist',
  active: true,
  serviceIds: [fx.serviceId],
  hours: null,
  ...over,
});

async function create(over: Record<string, unknown> = {}) {
  const r = await createStaffCore(ownerId, fx.businessId, input(over));
  if (!r.ok) throw new Error(`create failed: ${r.code}`);
  return r.staffId;
}

async function seedBooking(staffId: string, startsAt: Date, status: BookingStatus = 'CONFIRMED', serviceId = fx.serviceId) {
  return db.booking.create({
    data: {
      reference: generateReference(),
      businessId: fx.businessId,
      serviceId,
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

// ---- (a) create / update / tenancy ------------------------------------------------------
test('create + update persist fields, replace service links and keep photoUrl', async () => {
  const second = await db.service.create({ data: { businessId: fx.businessId, category: 'nails', name: 'Pedicure', durationMin: 45, priceCents: 2500 } });
  const id = await create();
  expect(await db.staffMember.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: SECRET_NAME, role: 'Colourist', active: true, sortOrder: 2 });
  expect((await db.staffService.findMany({ where: { staffId: id } })).map((l) => l.serviceId)).toEqual([fx.serviceId]);
  await db.staffMember.update({ where: { id }, data: { photoUrl: 'https://example.test/p.jpg' } });

  const r = await updateStaffCore(ownerId, fx.businessId, id, input({ name: 'Renamed Person', role: '', serviceIds: [second.id] }));
  expect(r).toMatchObject({ ok: true });
  const row = await db.staffMember.findUniqueOrThrow({ where: { id } });
  expect(row).toMatchObject({ name: 'Renamed Person', role: 'Specialist', photoUrl: 'https://example.test/p.jpg' });
  expect((await db.staffService.findMany({ where: { staffId: id } })).map((l) => l.serviceId)).toEqual([second.id]);
});

test('cross-tenant ids and other owners are rejected with no change', async () => {
  const id = await create();
  // A service of another business.
  expect(await createStaffCore(ownerId, fx.businessId, input({ serviceIds: [other.serviceId] }))).toMatchObject({ ok: false, code: 'VALIDATION', errors: { serviceIds: 'serviceInvalid' } });
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ serviceIds: [other.serviceId] }))).toMatchObject({ ok: false, code: 'VALIDATION' });
  // A staff member of another business, addressed through my business.
  const foreign = other.staffIds[0]!;
  expect(await updateStaffCore(ownerId, fx.businessId, foreign, input())).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await setStaffActiveCore(ownerId, fx.businessId, foreign, false)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await moveStaffCore(ownerId, fx.businessId, foreign, 'up')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await deleteStaffCore(ownerId, fx.businessId, foreign)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await addDayOffCore(ownerId, fx.businessId, foreign, { fromDate: fx.dateKey, toDate: fx.dateKey })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  // Another owner against my business.
  expect(await createStaffCore(otherOwnerId, fx.businessId, input())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await updateStaffCore(otherOwnerId, fx.businessId, id, input({ name: 'Hijacked' }))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await deleteStaffCore(otherOwnerId, fx.businessId, id)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await createStaffCore(null, fx.businessId, input())).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  // A day-off id of another business.
  const off = await addDayOffCore(otherOwnerId, other.businessId, foreign, { fromDate: fx.dateKey, toDate: fx.dateKey });
  expect(off.ok).toBe(true);
  if (!off.ok) return;
  expect(await removeDayOffCore(ownerId, fx.businessId, off.dayOffId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await db.staffDayOff.count({ where: { staffId: foreign } })).toBe(1);
  // Nothing of mine changed.
  expect((await db.staffMember.findUniqueOrThrow({ where: { id } })).name).toBe(SECRET_NAME);
  expect(await db.staffMember.count({ where: { businessId: fx.businessId } })).toBe(3);
});

// ---- (b) custom hours ---------------------------------------------------------------------
test('custom hours write all 7 rows; invalid, partial and outside-business hours are rejected; inherit deletes', async () => {
  const id = await create({ hours: week() });
  expect(await db.staffHours.count({ where: { staffId: id } })).toBe(7);

  // Partial week, close-before-open, outside the 09:00-18:00 business window.
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ hours: week().slice(0, 5) }))).toMatchObject({ ok: false, code: 'VALIDATION' });
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ hours: week({ opensMin: 900, closesMin: 800 }, 2) }))).toMatchObject({ ok: false, errors: { 'hours.2': 'closeBeforeOpen' } });
  const outside = await updateStaffCore(ownerId, fx.businessId, id, input({ hours: week({ opensMin: 480 }, 3) }));
  expect(outside).toMatchObject({ ok: false, code: 'VALIDATION', errors: { hours: 'outsideBusinessHours', 'hours.3': 'outsideBusinessHours' } });
  // Business closed on Sunday: staff cannot be open then.
  await db.openingHours.update({ where: { businessId_weekday: { businessId: fx.businessId, weekday: 0 } }, data: { closed: true } });
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ hours: week() }))).toMatchObject({ ok: false, errors: { 'hours.0': 'outsideBusinessHours' } });
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ hours: week({ closed: true }, 0) }))).toMatchObject({ ok: true });
  expect(await db.staffHours.count({ where: { staffId: id } })).toBe(7);
  await db.openingHours.update({ where: { businessId_weekday: { businessId: fx.businessId, weekday: 0 } }, data: { closed: false } });
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ hours: week() }))).toMatchObject({ ok: true });

  // The engine honours the custom window (10:00-16:00, 60-min service, 30-min grid): 11 starts, not 15.
  const loaded = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId: id, days: 5 });
  const day = computeAvailability(loaded!.input).find((d) => d.dateKey === fx.dateKey);
  expect(day!.slots).toHaveLength(11);

  // Back to inherit: rows are deleted.
  expect(await updateStaffCore(ownerId, fx.businessId, id, input({ hours: null }))).toMatchObject({ ok: true });
  expect(await db.staffHours.count({ where: { staffId: id } })).toBe(0);
});

// ---- (c) days off ------------------------------------------------------------------------
test('a day off removes that staff member from the engine; "any" falls back to the other', async () => {
  const [a, b] = fx.staffIds as [string, string];
  const r = await addDayOffCore(ownerId, fx.businessId, a, { fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 1), reason: SECRET_REASON });
  expect(r).toMatchObject({ ok: true });

  const any = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, days: 6 });
  const days = computeAvailability(any!.input);
  const off = days.find((d) => d.dateKey === fx.dateKey)!;
  expect(off.slots.length).toBeGreaterThan(0);
  expect(off.slots.every((s) => s.availableStaffIds.join() === b)).toBe(true);
  const after = days.find((d) => d.dateKey === addDaysToKey(fx.dateKey, 2))!;
  expect(after.slots.some((s) => s.availableStaffIds.includes(a))).toBe(true);

  const only = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId: a, days: 6 });
  expect(computeAvailability(only!.input).find((d) => d.dateKey === fx.dateKey)!.slots).toEqual([]);

  // Booking "any" on that date lands on the other person; booking the person directly is refused.
  const direct = await createBookingRecord({ input: bookingInput(fx, { staffId: a }) });
  expect(direct).toMatchObject({ ok: false, code: 'SLOT_TAKEN' });
  const viaAny = await createBookingRecord({ input: bookingInput(fx, { staffId: 'any' }) });
  expect(viaAny.ok).toBe(true);
  const booked = await db.booking.findFirstOrThrow({ where: { businessId: fx.businessId } });
  expect(booked.staffId).toBe(b);

  // Removing the day off gives the time back.
  const team = await loadTeamForDashboard(fx.businessId);
  const dayOff = team.members.find((m) => m.id === a)!.daysOff[0]!;
  expect(await removeDayOffCore(ownerId, fx.businessId, dayOff.id)).toMatchObject({ ok: true });
  const back = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId: a, days: 6 });
  expect(computeAvailability(back!.input).find((d) => d.dateKey === fx.dateKey)!.slots.length).toBeGreaterThan(0);
});

test('day-off range validation', async () => {
  const a = fx.staffIds[0]!;
  const bad = (v: Record<string, unknown>) => addDayOffCore(ownerId, fx.businessId, a, v);
  expect(await bad({ fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, -1) })).toMatchObject({ ok: false, errors: { toDate: 'toBeforeFrom' } });
  expect(await bad({ fromDate: addDaysToKey(fx.dateKey, -30), toDate: addDaysToKey(fx.dateKey, -29) })).toMatchObject({ ok: false, errors: { toDate: 'inPast' } });
  expect(await bad({ fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 400) })).toMatchObject({ ok: false, errors: { toDate: 'tooLong' } });
  expect(await bad({ fromDate: 'nope', toDate: fx.dateKey })).toMatchObject({ ok: false, code: 'VALIDATION' });
  expect(await db.staffDayOff.count({ where: { staffId: a } })).toBe(0);
});

test('a day off over a future active booking is refused with counts and dates only', async () => {
  const a = fx.staffIds[0]!;
  await seedBooking(a, new Date(fx.slotIso), 'CONFIRMED');
  await seedBooking(a, new Date(new Date(fx.slotIso).getTime() + 2 * HOUR), 'PENDING');
  await seedBooking(a, new Date(new Date(fx.slotIso).getTime() + 4 * HOUR), 'CANCELLED_BY_BUSINESS'); // does not count
  const r = await addDayOffCore(ownerId, fx.businessId, a, { fromDate: addDaysToKey(fx.dateKey, -1), toDate: addDaysToKey(fx.dateKey, 1), reason: SECRET_REASON });
  expect(r).toMatchObject({ ok: false, code: 'HAS_BOOKINGS', futureCount: 2, conflictDates: [fx.dateKey] });
  expect(JSON.stringify(r)).not.toContain('Walk In');
  expect(await db.staffDayOff.count({ where: { staffId: a } })).toBe(0);
  // A neighbouring range without bookings is fine.
  expect(await addDayOffCore(ownerId, fx.businessId, a, { fromDate: addDaysToKey(fx.dateKey, 1), toDate: addDaysToKey(fx.dateKey, 2) })).toMatchObject({ ok: true });
});

test('race: day off creation vs an online booking on that date: exactly one wins, nothing stranded', async () => {
  for (let i = 0; i < 5; i++) {
    const f = await createFixture(1);
    try {
      const owner = (await db.business.findUniqueOrThrow({ where: { id: f.businessId } })).ownerId;
      const staffId = f.staffIds[0]!;
      const [off, book] = await Promise.allSettled([
        addDayOffCore(owner, f.businessId, staffId, { fromDate: f.dateKey, toDate: f.dateKey }),
        createBookingRecord({ input: bookingInput(f, { staffId }) }),
      ]);
      expect(off.status).toBe('fulfilled');
      expect(book.status).toBe('fulfilled');
      if (off.status !== 'fulfilled' || book.status !== 'fulfilled') continue;
      const bookings = await db.booking.count({ where: { businessId: f.businessId } });
      const offs = await db.staffDayOff.count({ where: { staffId } });
      if (book.value.ok) {
        expect(off.value).toMatchObject({ ok: false, code: 'HAS_BOOKINGS', futureCount: 1 });
        expect(bookings).toBe(1);
        expect(offs).toBe(0);
      } else {
        expect(book.value.code).toBe('SLOT_TAKEN');
        expect(off.value).toMatchObject({ ok: true });
        expect(bookings).toBe(0);
        expect(offs).toBe(1);
      }
    } finally {
      await db.auditLog.deleteMany({ where: { businessId: f.businessId } });
      await f.cleanup();
    }
  }
});

// ---- (d) deactivate -----------------------------------------------------------------------
test('deactivate is refused with a future booking; otherwise the member leaves the loaders but old bookings still render', async () => {
  const [a, b] = fx.staffIds as [string, string];
  const future = await seedBooking(a, new Date(Date.now() + 2 * DAY), 'CONFIRMED');
  expect(await setStaffActiveCore(ownerId, fx.businessId, a, false)).toMatchObject({ ok: false, code: 'HAS_FUTURE_BOOKINGS', futureCount: 1 });
  expect(await updateStaffCore(ownerId, fx.businessId, a, input({ name: 'E2E Staff 1', active: false }))).toMatchObject({ ok: false, code: 'HAS_FUTURE_BOOKINGS' });
  expect((await db.staffMember.findUniqueOrThrow({ where: { id: a } })).active).toBe(true);

  await db.booking.update({ where: { id: future.id }, data: { startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - 3 * DAY + HOUR), status: 'COMPLETED' } });
  expect(await setStaffActiveCore(ownerId, fx.businessId, a, false)).toMatchObject({ ok: true });

  const any = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, days: 6 });
  expect(any!.input.staff.map((s) => s.id)).toEqual([b]);
  expect(await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId: a, days: 6 })).toBeNull();
  // createBookingRecord cannot pick the inactive member.
  expect(await createBookingRecord({ input: bookingInput(fx, { staffId: a }) })).toMatchObject({ ok: false, code: 'VALIDATION' });
  // Existing booking still renders with the deactivated member's name.
  const page = await loadBookingsPage(fx.businessId, parseBookingsParams({ status: 'all' }), 'en');
  expect(page.rows.find((r) => r.staffId === a)?.staffName).toBe('E2E Staff 1');
  // Activate restores.
  expect(await setStaffActiveCore(ownerId, fx.businessId, a, true)).toMatchObject({ ok: true });
  expect((await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId: a, days: 6 }))!.input.staff).toHaveLength(2);
});

test('warnings: a live listing without active staff or with an uncovered visible service', async () => {
  const [a, b] = fx.staffIds as [string, string];
  expect(await setStaffActiveCore(ownerId, fx.businessId, a, false)).toMatchObject({ ok: true, warnings: [] });
  const r = await setStaffActiveCore(ownerId, fx.businessId, b, false);
  expect(r).toMatchObject({ ok: true });
  if (r.ok) expect(r.warnings).toEqual(['NO_ACTIVE_STAFF', 'SERVICE_WITHOUT_STAFF']);
  const team = await loadTeamForDashboard(fx.businessId);
  expect(team.members.every((m) => m.soleProviderOf.length === 0)).toBe(true);
  await setStaffActiveCore(ownerId, fx.businessId, a, true);
  const t2 = await loadTeamForDashboard(fx.businessId);
  expect(t2.members.find((m) => m.id === a)!.soleProviderOf).toEqual(['E2E Manicure']);
});

// ---- (e) delete ---------------------------------------------------------------------------
test('delete: none -> removed with cascades; history -> archived; future -> refused', async () => {
  const id = await create({ hours: week() });
  await addDayOffCore(ownerId, fx.businessId, id, { fromDate: fx.dateKey, toDate: fx.dateKey });
  await db.block.create({ data: { businessId: fx.businessId, staffId: id, startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + DAY + HOUR) } });
  expect(await deleteStaffCore(ownerId, fx.businessId, id)).toMatchObject({ ok: true, outcome: 'DELETED' });
  expect(await db.staffMember.findUnique({ where: { id } })).toBeNull();
  for (const n of [db.staffHours.count({ where: { staffId: id } }), db.staffService.count({ where: { staffId: id } }), db.staffDayOff.count({ where: { staffId: id } }), db.block.count({ where: { staffId: id } })]) {
    expect(await n).toBe(0);
  }

  const [a, b] = fx.staffIds as [string, string];
  await seedBooking(a, new Date(Date.now() - 2 * DAY), 'COMPLETED');
  expect(await deleteStaffCore(ownerId, fx.businessId, a)).toMatchObject({ ok: true, outcome: 'ARCHIVED' });
  expect(await db.staffMember.findUniqueOrThrow({ where: { id: a } })).toMatchObject({ active: false });
  expect(await db.booking.count({ where: { staffId: a } })).toBe(1);

  await seedBooking(b, new Date(Date.now() + 2 * DAY), 'PENDING');
  expect(await deleteStaffCore(ownerId, fx.businessId, b)).toMatchObject({ ok: false, code: 'HAS_FUTURE_BOOKINGS', futureCount: 1 });
  expect(await db.staffMember.findUnique({ where: { id: b } })).not.toBeNull();
});

test('race: delete vs a new online booking never crashes and never orphans', async () => {
  for (let i = 0; i < 5; i++) {
    const f = await createFixture(1);
    try {
      const owner = (await db.business.findUniqueOrThrow({ where: { id: f.businessId } })).ownerId;
      const staffId = f.staffIds[0]!;
      const [del, book] = await Promise.allSettled([
        deleteStaffCore(owner, f.businessId, staffId),
        createBookingRecord({ input: bookingInput(f, { staffId }) }),
      ]);
      expect(del.status).toBe('fulfilled');
      expect(book.status).toBe('fulfilled');
      if (del.status !== 'fulfilled' || book.status !== 'fulfilled') continue;
      const bookings = await db.booking.count({ where: { businessId: f.businessId } });
      const staff = await db.staffMember.findUnique({ where: { id: staffId } });
      if (book.value.ok) {
        expect(del.value).toMatchObject({ ok: false, code: 'HAS_FUTURE_BOOKINGS' });
        expect(bookings).toBe(1);
        expect(staff).not.toBeNull();
      } else {
        expect(['VALIDATION', 'SLOT_TAKEN']).toContain(book.value.code);
        expect(del.value).toMatchObject({ ok: true, outcome: 'DELETED' });
        expect(bookings).toBe(0);
        expect(staff).toBeNull();
      }
    } finally {
      await db.auditLog.deleteMany({ where: { businessId: f.businessId } });
      await f.cleanup();
    }
  }
});

// ---- (f) reorder --------------------------------------------------------------------------
test('reorder keeps sortOrder dense and unique, and heals ties', async () => {
  const c = await create({ name: 'Third person' });
  await db.staffMember.updateMany({ where: { businessId: fx.businessId }, data: { sortOrder: 5 } }); // all tied
  expect(await moveStaffCore(ownerId, fx.businessId, c, 'up')).toMatchObject({ ok: true, moved: true });
  const rows = await db.staffMember.findMany({ where: { businessId: fx.businessId }, orderBy: { sortOrder: 'asc' } });
  expect(rows.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  expect(new Set(rows.map((s) => s.id)).size).toBe(3);
  expect(await moveStaffCore(ownerId, fx.businessId, rows[0]!.id, 'up')).toMatchObject({ ok: true, moved: false });
  expect(await moveStaffCore(ownerId, fx.businessId, c, 'sideways' as 'up')).toMatchObject({ ok: false, code: 'VALIDATION' });
  // Deleting re-densifies.
  await deleteStaffCore(ownerId, fx.businessId, rows[1]!.id);
  expect((await db.staffMember.findMany({ where: { businessId: fx.businessId }, orderBy: { sortOrder: 'asc' } })).map((s) => s.sortOrder)).toEqual([0, 1]);
});

// ---- (g) audit ----------------------------------------------------------------------------
test('audit rows carry ids and field names only', async () => {
  const id = await create({ hours: week() });
  await updateStaffCore(ownerId, fx.businessId, id, input({ role: 'Other role', hours: null }));
  await setStaffActiveCore(ownerId, fx.businessId, id, false);
  await setStaffActiveCore(ownerId, fx.businessId, id, true);
  await moveStaffCore(ownerId, fx.businessId, id, 'up');
  const off = await addDayOffCore(ownerId, fx.businessId, id, { fromDate: fx.dateKey, toDate: fx.dateKey, reason: SECRET_REASON });
  if (off.ok) await removeDayOffCore(ownerId, fx.businessId, off.dayOffId);
  await deleteStaffCore(ownerId, fx.businessId, id);
  const rows = await db.auditLog.findMany({ where: { businessId: fx.businessId } });
  const actions = rows.map((r) => r.action);
  for (const a of ['staff.create', 'staff.update', 'staff.deactivate', 'staff.activate', 'staff.move', 'staff.dayoff.add', 'staff.dayoff.remove', 'staff.delete']) {
    expect(actions).toContain(a);
  }
  const dump = JSON.stringify(rows);
  for (const secret of [SECRET_NAME, SECRET_REASON, 'Colourist', 'Other role', fx.dateKey]) expect(dump).not.toContain(secret);
  const upd = rows.find((r) => r.action === 'staff.update')!;
  expect((upd.meta as { fields: string[] }).fields.sort()).toEqual(['hours', 'role']);
});

// ---- (h) onboarding -----------------------------------------------------------------------
test('onboarding saveFirstServiceCore still edits the first staff member and does not duplicate', async () => {
  await create({ name: 'Third person' });
  const r = await saveFirstServiceCore(ownerId, fx.businessId, { serviceName: 'Renamed first', serviceCategory: 'nails', durationMin: '30', price: '20', staffName: 'Anna' });
  expect(r.ok).toBe(true);
  const rows = await db.staffMember.findMany({ where: { businessId: fx.businessId }, orderBy: { sortOrder: 'asc' } });
  expect(rows.map((s) => s.name)).toEqual(['Anna', 'E2E Staff 2', 'Third person']);
});
