/**
 * Owner mutation -> audit-log coverage (task 6.9, req 5.1). Real Postgres; the lib cores behind
 * the 'use server' wrappers are called directly. For each mutation family: a SUCCESSFUL call leaves
 * exactly the expected AuditLog row(s) (actor = owner, meta keys from a short allowlist), a FAILED
 * call (validation / FORBIDDEN / NOT_FOUND) leaves none and changes nothing, and no distinctive
 * input string ever reaches audit meta.
 * Revalidation is asserted in lib/owner-effects.test.ts (next/cache needs the Next runtime, so
 * this file must not import it, directly or through the wrappers).
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { createBookingRecord } from '../lib/booking';
import { createBlockCore, deleteBlockCore } from '../lib/block';
import { changeBookingStatusCore } from '../lib/booking-status-change';
import { addClosureCore, removeClosureCore, saveBusinessHoursCore } from '../lib/business-hours';
import { createManualBookingCore } from '../lib/manual-booking';
import { addPhotoCore, deletePhotoCore, movePhotoCore, updatePhotoAltCore } from '../lib/photos';
import { saveProfileCore } from '../lib/profile';
import { reportReviewCore } from '../lib/review-manage';
import { removeReviewReplyCore, replyToReviewCore } from '../lib/review-reply';
import { createServiceCore, deleteServiceCore, setServiceActiveCore, updateServiceCore } from '../lib/services';
import { saveSettingsCore, unpublishCore } from '../lib/settings-save';
import { addDayOffCore, createStaffCore, updateStaffCore } from '../lib/team';
import { addDaysToKey } from '../lib/time';
import { bookingInput, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
let otherOwnerId: string;

// Distinctive strings that must never appear in audit meta.
const SECRETS = [
  'Secret Salon Name 7731',
  'Secret tagline 4417',
  'Secret about 9921',
  'Secret Gel Service 5512',
  'Secret Staff Person 3308',
  'Secret Role 6604',
  'Secret closure reason 1187',
  'Secret block reason 2290',
  'Secret reply text 8843',
  'Secret alt text 1156',
  'Secret Walk In 4471',
  'secret-walkin-4471@e2e.test',
  '+35799123456',
  'secret_instagram_5521',
  'secret-site-9981.example.com',
  '#1a2b3c',
  '#3c2b1a',
  'res.cloudinary.com',
];
const [S_SALON, S_TAGLINE, S_ABOUT, S_SERVICE, S_STAFF, S_ROLE, S_CLOSURE, S_BLOCK, S_REPLY, S_ALT, S_WALKIN, S_EMAIL] = SECRETS as [
  string, string, string, string, string, string, string, string, string, string, string, string,
];

/** Meta keys that are ids or counts/field names; `reason` is allowed only on review.flag (fixed code). */
const ALLOWED_META_KEYS = new Set([
  'serviceId', 'staffId', 'staffIds', 'dayOffId', 'closureId', 'photoId', 'blockId', 'bookingId', 'reviewId',
  'fields', 'direction', 'count', 'from', 'to', 'status', 'staffCount', 'occurrences', 'recurrence',
]);

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

const audits = (businessId = fx.businessId) =>
  db.auditLog.findMany({ where: { businessId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
const actionsOf = async () => (await audits()).map((a) => a.action);

/** Every audit row for the fixture business: actor is the owner, meta keys allowed, no secrets. */
async function expectCleanAudit() {
  const rows = await audits();
  for (const r of rows) {
    expect(r.actorId, r.action).toBe(ownerId);
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(meta)) {
      const ok = ALLOWED_META_KEYS.has(k) || (r.action === 'review.flag' && k === 'reason');
      expect(ok, `${r.action}: unexpected meta key "${k}"`).toBe(true);
    }
    if (r.action === 'review.flag') expect(meta.reason).toBe('spam');
  }
  const blob = JSON.stringify(rows.map((r) => r.meta));
  for (const s of SECRETS) expect(blob, `audit meta leaked "${s}"`).not.toContain(s);
}

/** Run `fn` and assert it wrote no audit row anywhere for either business. */
async function expectNoAudit(fn: () => Promise<unknown>) {
  const count = () => db.auditLog.count({ where: { businessId: { in: [fx.businessId, other.businessId] } } });
  const before = await count();
  await fn();
  expect(await count()).toBe(before);
}

const profileInput = (over: Record<string, unknown> = {}) => ({
  name: S_SALON, category: 'hair', city: 'Nicosia', languages: ['en', 'el'], tagline: S_TAGLINE, about: S_ABOUT,
  address: '12 Ledra Street', phone: '99 123456', whatsapp: '', instagram: 'secret_instagram_5521', website: 'secret-site-9981.example.com',
  lat: '35.17', lng: '33.36',
  translations: { el: { tagline: '', about: '' }, ru: { tagline: '', about: '' } },
  ...over,
});
const serviceInput = (over: Record<string, unknown> = {}) => ({
  name: S_SERVICE, category: 'nails', description: S_ABOUT, durationMin: '45', bufferMin: '5', price: '25.50', active: true,
  staffIds: [fx.staffIds[0]!],
  translations: { el: { name: '', description: '' }, ru: { name: '', description: '' } },
  ...over,
});
const staffInput = (over: Record<string, unknown> = {}) => ({
  name: S_STAFF, role: S_ROLE, active: true, serviceIds: [fx.serviceId], hours: null, ...over,
});
const CLOUD = 'e2e-cloud';
const photoBody = (businessId: string, name: string) => ({
  url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/she/${businessId}/${name}.jpg`,
  publicId: `she/${businessId}/${name}`, format: 'jpg', bytes: 123_456,
});

test('profile: one row; failures write nothing and change nothing', async () => {
  await expectNoAudit(async () => {
    expect(await saveProfileCore(ownerId, fx.businessId, profileInput({ name: '' }))).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await saveProfileCore(otherOwnerId, fx.businessId, profileInput())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  const before = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
  expect(before.name).not.toBe(S_SALON);

  expect(await saveProfileCore(ownerId, fx.businessId, profileInput())).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['business.profile']);
  await expectCleanAudit();
});

test('hours save, closure add/remove', async () => {
  const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: false, opensMin: 600, closesMin: 960 }));
  await expectNoAudit(async () => {
    expect(await saveBusinessHoursCore(ownerId, fx.businessId, null)).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await saveBusinessHoursCore(otherOwnerId, fx.businessId, { days })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await addClosureCore(ownerId, fx.businessId, { fromDate: 'nope', toDate: 'nope' })).toMatchObject({ ok: false });
    expect(await removeClosureCore(ownerId, fx.businessId, 'missing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  expect(await saveBusinessHoursCore(ownerId, fx.businessId, { days })).toMatchObject({ ok: true });
  const added = await addClosureCore(ownerId, fx.businessId, { fromDate: fx.dateKey, toDate: addDaysToKey(fx.dateKey, 1), reason: S_CLOSURE });
  if (!added.ok) throw new Error('closure add failed');
  expect(await removeClosureCore(ownerId, fx.businessId, added.closureId)).toMatchObject({ ok: true });
  const actions = await actionsOf();
  expect(actions.slice(0, 1)).toEqual(['business.hours']);
  expect(actions).toContain('closure.add');
  expect(actions.at(-1)).toBe('closure.remove');
  await expectCleanAudit();
});

test('services: create, update, hide, delete', async () => {
  await expectNoAudit(async () => {
    expect(await createServiceCore(ownerId, fx.businessId, serviceInput({ staffIds: [] }))).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createServiceCore(otherOwnerId, fx.businessId, serviceInput())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await updateServiceCore(otherOwnerId, other.businessId, fx.serviceId, serviceInput())).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await setServiceActiveCore(ownerId, fx.businessId, 'missing', false)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await deleteServiceCore(ownerId, fx.businessId, 'missing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  const created = await createServiceCore(ownerId, fx.businessId, serviceInput());
  if (!created.ok) throw new Error('create failed');
  expect(await updateServiceCore(ownerId, fx.businessId, created.serviceId, serviceInput({ price: '30' }))).toMatchObject({ ok: true });
  expect(await setServiceActiveCore(ownerId, fx.businessId, created.serviceId, false)).toMatchObject({ ok: true });
  expect(await deleteServiceCore(ownerId, fx.businessId, created.serviceId)).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['service.create', 'service.update', 'service.hide', 'service.delete']);
  await expectCleanAudit();
});

test('team: create, update, day off', async () => {
  await expectNoAudit(async () => {
    expect(await createStaffCore(ownerId, fx.businessId, staffInput({ name: '' }))).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createStaffCore(otherOwnerId, fx.businessId, staffInput())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await addDayOffCore(ownerId, fx.businessId, other.staffIds[0]!, { fromDate: fx.dateKey, toDate: fx.dateKey })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  const created = await createStaffCore(ownerId, fx.businessId, staffInput());
  if (!created.ok) throw new Error('create failed');
  expect(await updateStaffCore(ownerId, fx.businessId, created.staffId, staffInput({ role: 'Other role' }))).toMatchObject({ ok: true });
  expect(await addDayOffCore(ownerId, fx.businessId, created.staffId, { fromDate: fx.dateKey, toDate: fx.dateKey, reason: S_CLOSURE })).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['staff.create', 'staff.update', 'staff.dayoff.add']);
  await expectCleanAudit();
});

test('photos: add, alt, move, delete', async () => {
  await expectNoAudit(async () => {
    expect(await addPhotoCore(ownerId, fx.businessId, photoBody(other.businessId, 'x'), CLOUD)).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await addPhotoCore(otherOwnerId, fx.businessId, photoBody(fx.businessId, 'x'), CLOUD)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await deletePhotoCore(ownerId, fx.businessId, 'missing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  const a = await addPhotoCore(ownerId, fx.businessId, photoBody(fx.businessId, 'a'), CLOUD);
  const b = await addPhotoCore(ownerId, fx.businessId, photoBody(fx.businessId, 'b'), CLOUD);
  if (!a.ok || !b.ok) throw new Error('add failed');
  expect(await updatePhotoAltCore(ownerId, fx.businessId, a.photoId, S_ALT)).toMatchObject({ ok: true });
  expect(await movePhotoCore(ownerId, fx.businessId, b.photoId, 'up')).toMatchObject({ ok: true });
  expect(await deletePhotoCore(ownerId, fx.businessId, a.photoId)).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['photo.add', 'photo.add', 'photo.alt', 'photo.move', 'photo.delete']);
  await expectCleanAudit();
});

test('settings save and unpublish', async () => {
  const rules = (over: Record<string, unknown> = {}) => ({
    autoConfirm: false, slotIntervalMin: 30, bufferMin: 0, minLeadMin: 0, maxAdvanceDays: 90,
    cancellationWindowHours: 24, maxPerCustomerPerDay: 3, ...over,
  });
  await expectNoAudit(async () => {
    expect(await saveSettingsCore(ownerId, fx.businessId, rules({ bufferMin: 7 }))).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await saveSettingsCore(otherOwnerId, fx.businessId, rules())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await unpublishCore(otherOwnerId, fx.businessId)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  expect(await saveSettingsCore(ownerId, fx.businessId, rules())).toMatchObject({ ok: true });
  expect(await unpublishCore(ownerId, fx.businessId)).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['business.settings', 'business.unpublish']);
  expect((await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).status).toBe('DRAFT');
  // Already a draft: refused, no extra row.
  await expectNoAudit(async () => {
    expect(await unpublishCore(ownerId, fx.businessId)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
  await expectCleanAudit();
});

test('manual booking, block create/delete, status change', async () => {
  const manual = (over: Record<string, unknown> = {}) => ({
    serviceId: fx.serviceId, staffId: fx.staffIds[0]!, date: fx.dateKey, time: '10:00', name: S_WALKIN, email: S_EMAIL, ...over,
  });
  const block = (over: Record<string, unknown> = {}) => ({
    staffId: fx.staffIds[0]!, dateKey: fx.dateKey, startMin: 840, endMin: 900, reason: S_BLOCK, ...over,
  });
  await expectNoAudit(async () => {
    expect(await createManualBookingCore(ownerId, fx.businessId, manual({ name: '' }))).toMatchObject({ ok: false });
    expect(await createManualBookingCore(otherOwnerId, fx.businessId, manual())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await createBlockCore(ownerId, fx.businessId, block({ startMin: 900, endMin: 840 }))).toMatchObject({ ok: false });
    expect(await createBlockCore(otherOwnerId, fx.businessId, block())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await deleteBlockCore(ownerId, fx.businessId, 'missing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await changeBookingStatusCore(ownerId, fx.businessId, 'missing', 'CONFIRMED')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  const made = await createManualBookingCore(ownerId, fx.businessId, manual());
  if (!made.ok) throw new Error(`manual failed: ${made.code}`);
  const blocked = await createBlockCore(ownerId, fx.businessId, block());
  if (!blocked.ok) throw new Error('block failed');
  const blockRow = await db.block.findFirstOrThrow({ where: { businessId: fx.businessId } });
  expect(await deleteBlockCore(ownerId, fx.businessId, blockRow.id)).toMatchObject({ ok: true });
  // Cancel is allowed before the start time.
  expect(await changeBookingStatusCore(ownerId, fx.businessId, made.bookingId, 'CANCELLED_BY_BUSINESS')).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['booking.manual-create', 'block.create', 'block.delete', 'booking.status']);
  expect((await db.booking.findUniqueOrThrow({ where: { id: made.bookingId } })).status).toBe('CANCELLED_BY_BUSINESS');
  await expectCleanAudit();
});

test('review reply, remove reply and flag', async () => {
  const booked = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) });
  if (!booked.ok) throw new Error('booking failed');
  const booking = await db.booking.findFirstOrThrow({ where: { businessId: fx.businessId } });
  const review = await db.review.create({
    data: { businessId: fx.businessId, bookingId: booking.id, authorName: 'Maria I.', rating: 4, body: 'Nice' },
  });
  await expectNoAudit(async () => {
    expect(await replyToReviewCore(ownerId, { reviewId: review.id, body: '   ' })).toEqual({ ok: false, code: 'VALIDATION' });
    expect(await replyToReviewCore(otherOwnerId, { reviewId: review.id, body: S_REPLY })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await removeReviewReplyCore(ownerId, { reviewId: 'missing' })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: review.id, reason: 'free text' })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await reportReviewCore(otherOwnerId, fx.businessId, { reviewId: review.id, reason: 'spam' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: 'missing', reason: 'spam' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).ownerReply).toBeNull();

  expect(await replyToReviewCore(ownerId, { reviewId: review.id, body: S_REPLY })).toMatchObject({ ok: true });
  expect(await removeReviewReplyCore(ownerId, { reviewId: review.id })).toMatchObject({ ok: true });
  expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: review.id, reason: 'spam' })).toMatchObject({ ok: true });
  expect(await actionsOf()).toEqual(['review.reply', 'review.reply.remove', 'review.flag']);
  await expectCleanAudit();
});

test('a staff name never reaches audit meta (random value)', async () => {
  // Complements the fixed-secret leak check with a random value.
  const name = `Name-${randomUUID()}`;
  expect(await createStaffCore(ownerId, fx.businessId, staffInput({ name }))).toMatchObject({ ok: true });
  const blob = JSON.stringify((await audits()).map((a) => a.meta));
  expect(blob).not.toContain(name);
});
