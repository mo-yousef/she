/**
 * DB-backed tests for services CRUD (task 6.4, req 5.1). Real Postgres; the lib cores behind
 * the 'use server' wrappers are called directly with explicit user ids (same approach as
 * onboarding.spec.ts / bookings.spec.ts). No browser, no email chain.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { BookingStatus } from '@prisma/client';
import { db } from '../lib/db';
import { createBookingRecord } from '../lib/booking';
import { loadAvailabilityInput } from '../lib/booking-availability';
import { loadBookingsPage } from '../lib/bookings-data';
import { parseBookingsParams } from '../lib/bookings-params';
import { saveFirstServiceCore } from '../lib/onboarding';
import { generateReference } from '../lib/reference';
import {
  createServiceCore,
  deleteServiceCore,
  moveServiceCore,
  setServiceActiveCore,
  updateServiceCore,
} from '../lib/services';
import { bookingInput, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
let otherOwnerId: string;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SECRET = 'Secret Gel Name 7731';

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

const input = (over: Record<string, unknown> = {}) => ({
  name: SECRET,
  category: 'nails',
  description: 'Long lasting',
  durationMin: '45',
  bufferMin: '5',
  price: '25.50',
  active: true,
  staffIds: [fx.staffIds[0]!],
  translations: { el: { name: 'Τζελ', description: '' }, ru: { name: '', description: '' } },
  ...over,
});

async function create(over: Record<string, unknown> = {}) {
  const r = await createServiceCore(ownerId, fx.businessId, input(over));
  if (!r.ok) throw new Error(`create failed: ${r.code}`);
  return r.serviceId;
}

async function seedBooking(serviceId: string, startsAt: Date, status: BookingStatus = 'CONFIRMED') {
  return db.booking.create({
    data: {
      reference: generateReference(),
      businessId: fx.businessId,
      serviceId,
      staffId: fx.staffIds[0]!,
      guestName: 'Walk In',
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      status,
      priceCents: 3000,
      manageTokenHash: randomUUID(),
    },
  });
}

const orders = async () =>
  (await db.service.findMany({ where: { businessId: fx.businessId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map((s) => s.sortOrder);

test('create and update persist fields, replace staff eligibility and manage translations', async () => {
  const id = await create();
  const row = await db.service.findUniqueOrThrow({ where: { id }, include: { staffLinks: true, translations: true } });
  expect(row).toMatchObject({ name: SECRET, durationMin: 45, bufferMin: 5, priceCents: 2550, active: true, sortOrder: 1, currency: 'EUR' });
  expect(row.staffLinks.map((l) => l.staffId)).toEqual([fx.staffIds[0]]);
  expect(row.translations.map((t) => t.locale)).toEqual(['el']); // empty ru is not stored

  const r = await updateServiceCore(ownerId, fx.businessId, id, input({
    name: 'Renamed', price: '0', staffIds: [fx.staffIds[1]!],
    translations: { el: { name: '', description: '' }, ru: { name: 'Гель', description: '' } },
  }));
  expect(r.ok).toBe(true);
  const after = await db.service.findUniqueOrThrow({ where: { id }, include: { staffLinks: true, translations: true } });
  expect(after).toMatchObject({ name: 'Renamed', priceCents: 0 }); // free service allowed
  expect(after.staffLinks.map((l) => l.staffId)).toEqual([fx.staffIds[1]]); // set replaced, not merged
  expect(after.translations.map((t) => `${t.locale}:${t.name}`)).toEqual(['ru:Гель']);
});

test('cross-tenant staff ids and service ids are rejected and change nothing', async () => {
  const before = await db.service.count({ where: { businessId: fx.businessId } });
  const bad = await createServiceCore(ownerId, fx.businessId, input({ staffIds: [other.staffIds[0]!] }));
  expect(bad).toMatchObject({ ok: false, code: 'VALIDATION', errors: { staffIds: 'staffInvalid' } });
  expect(await db.service.count({ where: { businessId: fx.businessId } })).toBe(before);

  const snapshot = await db.service.findUniqueOrThrow({ where: { id: fx.serviceId }, include: { staffLinks: true } });
  // Other owner, own business id, victim's service id -> NOT_FOUND
  expect(await updateServiceCore(otherOwnerId, other.businessId, fx.serviceId, input({ staffIds: [other.staffIds[0]!], name: 'Hijack' }))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await setServiceActiveCore(otherOwnerId, other.businessId, fx.serviceId, false)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await moveServiceCore(otherOwnerId, other.businessId, fx.serviceId, 'down')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  expect(await deleteServiceCore(otherOwnerId, other.businessId, fx.serviceId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  // Other owner pointing at the victim's business -> FORBIDDEN; anonymous -> UNAUTHENTICATED
  expect(await updateServiceCore(otherOwnerId, fx.businessId, fx.serviceId, input())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await createServiceCore(otherOwnerId, fx.businessId, input())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  expect(await deleteServiceCore(null, fx.businessId, fx.serviceId)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  const after = await db.service.findUniqueOrThrow({ where: { id: fx.serviceId }, include: { staffLinks: true } });
  expect(after).toEqual(snapshot);
});

test('a visible service needs staff; a hidden one may have none', async () => {
  expect(await createServiceCore(ownerId, fx.businessId, input({ staffIds: [] }))).toMatchObject({ ok: false, code: 'VALIDATION', errors: { staffIds: 'staffRequired' } });
  const id = await create({ active: false, staffIds: [] });
  expect((await db.service.findUniqueOrThrow({ where: { id } })).active).toBe(false);
  // Showing it without staff is refused with the same code.
  expect(await setServiceActiveCore(ownerId, fx.businessId, id, true)).toMatchObject({ ok: false, code: 'VALIDATION', errors: { staffIds: 'staffRequired' } });
  // Staff that are inactive don't count either.
  await db.staffMember.update({ where: { id: fx.staffIds[1]! }, data: { active: false } });
  expect(await updateServiceCore(ownerId, fx.businessId, id, input({ staffIds: [fx.staffIds[1]!] }))).toMatchObject({ ok: false, errors: { staffIds: 'staffRequired' } });
});

test('delete: no bookings removes the row and keeps order dense', async () => {
  const a = await create({ name: 'A service' });
  const b = await create({ name: 'B service' });
  const c = await create({ name: 'C service' });
  expect(await orders()).toEqual([0, 1, 2, 3]);
  const r = await deleteServiceCore(ownerId, fx.businessId, b);
  expect(r).toMatchObject({ ok: true, outcome: 'DELETED' });
  expect(await db.service.findUnique({ where: { id: b } })).toBeNull();
  expect(await db.serviceTranslation.count({ where: { serviceId: b } })).toBe(0);
  expect(await db.staffService.count({ where: { serviceId: b } })).toBe(0);
  expect(await orders()).toEqual([0, 1, 2]);
  expect(a && c).toBeTruthy();
});

test('delete: history-only service is archived (hidden), bookings intact', async () => {
  const id = await create();
  await seedBooking(id, new Date(Date.now() - 3 * DAY), 'COMPLETED');
  await seedBooking(id, new Date(Date.now() - 2 * DAY), 'CONFIRMED'); // ended already
  await seedBooking(id, new Date(Date.now() + 2 * DAY), 'CANCELLED_BY_CUSTOMER'); // terminal
  const r = await deleteServiceCore(ownerId, fx.businessId, id);
  expect(r).toMatchObject({ ok: true, outcome: 'ARCHIVED' });
  expect(await db.service.findUniqueOrThrow({ where: { id } })).toMatchObject({ active: false });
  expect(await db.booking.count({ where: { serviceId: id } })).toBe(3);
});

test('delete: a future PENDING/CONFIRMED booking refuses and changes nothing', async () => {
  const id = await create();
  await seedBooking(id, new Date(Date.now() + 2 * DAY), 'CONFIRMED');
  await seedBooking(id, new Date(Date.now() + 3 * DAY), 'PENDING');
  const before = await db.service.findUniqueOrThrow({ where: { id }, include: { staffLinks: true, translations: true } });
  const r = await deleteServiceCore(ownerId, fx.businessId, id);
  expect(r).toMatchObject({ ok: false, code: 'HAS_FUTURE_BOOKINGS', futureCount: 2 });
  expect(await db.service.findUniqueOrThrow({ where: { id }, include: { staffLinks: true, translations: true } })).toEqual(before);
  expect(await db.booking.count({ where: { serviceId: id } })).toBe(2);
});

test('race: delete vs a new online booking never crashes and never orphans', async () => {
  for (let i = 0; i < 5; i++) {
    const f = await createFixture(1);
    try {
      const owner = (await db.business.findUniqueOrThrow({ where: { id: f.businessId } })).ownerId;
      const [del, book] = await Promise.allSettled([
        deleteServiceCore(owner, f.businessId, f.serviceId),
        createBookingRecord({ input: bookingInput(f, { staffId: f.staffIds[0]! }) }),
      ]);
      expect(del.status).toBe('fulfilled');
      expect(book.status).toBe('fulfilled');
      if (del.status !== 'fulfilled' || book.status !== 'fulfilled') continue;
      const bookings = await db.booking.count({ where: { businessId: f.businessId } });
      const service = await db.service.findUnique({ where: { id: f.serviceId } });
      if (book.value.ok) {
        // Booking won: the delete must have been refused, and the service must still exist.
        expect(del.value).toMatchObject({ ok: false, code: 'HAS_FUTURE_BOOKINGS' });
        expect(bookings).toBe(1);
        expect(service).not.toBeNull();
      } else {
        // Delete won: booking rejected as unknown service, nothing orphaned.
        expect(book.value.code).toBe('VALIDATION');
        expect(del.value).toMatchObject({ ok: true, outcome: 'DELETED' });
        expect(bookings).toBe(0);
        expect(service).toBeNull();
      }
    } finally {
      await db.auditLog.deleteMany({ where: { businessId: f.businessId } });
      await f.cleanup();
    }
  }
});

test('hide keeps existing bookings working, blocks new ones, and show restores', async () => {
  const startsAt = new Date(Date.now() + 2 * DAY);
  const existing = await seedBooking(fx.serviceId, startsAt, 'CONFIRMED');

  const hidden = await setServiceActiveCore(ownerId, fx.businessId, fx.serviceId, false);
  expect(hidden).toMatchObject({ ok: true });
  // Existing booking unchanged and still renders (service name read by id, not filtered by active).
  expect(await db.booking.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ status: 'CONFIRMED', serviceId: fx.serviceId });
  const page = await loadBookingsPage(fx.businessId, parseBookingsParams({ status: 'all' }), 'en');
  expect(page.rows.map((r) => r.service)).toContain('E2E Manicure');
  // Public availability loader and the booking record both treat it as unknown.
  expect(await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, staffId: fx.staffIds[0]!, days: 3 })).toBeNull();
  const blocked = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[1]! }) });
  expect(blocked).toMatchObject({ ok: false, code: 'VALIDATION' });

  expect(await setServiceActiveCore(ownerId, fx.businessId, fx.serviceId, true)).toMatchObject({ ok: true });
  const again = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[1]! }) });
  expect(again.ok).toBe(true);
});

test('hiding the last visible service of a live listing returns a non-blocking warning', async () => {
  await db.business.update({ where: { id: fx.businessId }, data: { status: 'PUBLISHED' } });
  const r = await setServiceActiveCore(ownerId, fx.businessId, fx.serviceId, false);
  expect(r).toMatchObject({ ok: true, warnings: ['NO_VISIBLE_SERVICE'] });
  await db.business.update({ where: { id: fx.businessId }, data: { status: 'DRAFT' } });
  expect(await setServiceActiveCore(ownerId, fx.businessId, fx.serviceId, true)).toMatchObject({ ok: true, warnings: [] });
});

test('move up/down swaps within a category, keeps order unique and dense, edges are no-ops', async () => {
  const a = await create({ name: 'A service' });
  const b = await create({ name: 'B service' });
  const h = await create({ name: 'H service', category: 'hair' });
  await db.service.updateMany({ where: { businessId: fx.businessId }, data: { sortOrder: 0 } }); // ties heal on move
  const names = async () => (await db.service.findMany({ where: { businessId: fx.businessId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map((s) => s.id);

  const first = await moveServiceCore(ownerId, fx.businessId, b, 'up');
  expect(first).toMatchObject({ ok: true });
  expect(new Set(await orders()).size).toBe(4);
  expect(await orders()).toEqual([0, 1, 2, 3]);
  const order = await names();
  expect(order.indexOf(b)).toBeLessThan(order.indexOf(a)); // b now precedes a

  const edge = await moveServiceCore(ownerId, fx.businessId, h, 'up'); // only hair service
  expect(edge).toMatchObject({ ok: true, moved: false });
  expect(await names()).toEqual(order);
  const down = await moveServiceCore(ownerId, fx.businessId, b, 'down');
  expect(down).toMatchObject({ ok: true, moved: true });
  expect(await orders()).toEqual([0, 1, 2, 3]);
  expect(await moveServiceCore(ownerId, fx.businessId, b, 'sideways' as 'up')).toMatchObject({ ok: false, code: 'VALIDATION' });
});

test('onboarding saveFirstServiceCore still edits the first service and does not duplicate', async () => {
  await create({ name: 'Second' });
  await create({ name: 'Third' });
  const r = await saveFirstServiceCore(ownerId, fx.businessId, { serviceName: 'Renamed first', serviceCategory: 'nails', durationMin: '30', price: '20', staffName: 'Anna' });
  expect(r.ok).toBe(true);
  const rows = await db.service.findMany({ where: { businessId: fx.businessId }, orderBy: { sortOrder: 'asc' } });
  expect(rows.map((s) => s.name)).toEqual(['Renamed first', 'Second', 'Third']);
  expect(rows[1]!.priceCents).toBe(2550); // untouched
});

test('audit rows carry ids and field names only', async () => {
  const id = await create();
  await updateServiceCore(ownerId, fx.businessId, id, input({ price: '30' }));
  await setServiceActiveCore(ownerId, fx.businessId, id, false);
  await moveServiceCore(ownerId, fx.businessId, id, 'up');
  await seedBooking(id, new Date(Date.now() - DAY), 'COMPLETED');
  await deleteServiceCore(ownerId, fx.businessId, id); // archive
  const rows = await db.auditLog.findMany({ where: { businessId: fx.businessId, action: { startsWith: 'service.' } } });
  expect(rows.map((r) => r.action).sort()).toEqual(['service.archive', 'service.create', 'service.hide', 'service.move', 'service.update']);
  const update = rows.find((r) => r.action === 'service.update')!;
  expect(update.meta).toMatchObject({ serviceId: id, fields: ['priceCents'] });
  for (const r of rows) {
    expect(Object.keys(r.meta as object).every((k) => ['serviceId', 'fields', 'direction'].includes(k))).toBe(true);
    const text = JSON.stringify(r.meta);
    for (const forbidden of [SECRET, 'Long lasting', '2550', '25.50']) expect(text).not.toContain(forbidden);
  }
});
