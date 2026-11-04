/**
 * DB-backed GDPR tests (task 7.2, req 9). Real Postgres; the cores are called directly.
 * One browser check at the end: the signed-in account page shows both sections.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { createBookingRecord, manageTokenFor } from '../lib/booking';
import { buildExport, CONSENT_VERSION } from '../lib/gdpr';
import { deleteAccountCore, loadExportRows, runRetention } from '../lib/gdpr-server';
import { signInAs } from './auth';
import { bookingInput, createFixture, type Fixture } from './fixtures';

const DAY = 86_400_000;
const tag = () => randomUUID().slice(0, 8);
let fx: Fixture;
const users: string[] = [];

test.beforeEach(async () => {
  fx = await createFixture(1);
});
test.afterEach(async () => {
  await fx.cleanup();
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.favourite.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
});

async function mkUser(role: 'CUSTOMER' | 'OWNER' = 'CUSTOMER') {
  const u = await db.user.create({
    data: { email: `u-${tag()}@e2e.test`, name: 'Gdpr User', phone: '+35799111222', role, emailVerified: new Date() },
  });
  users.push(u.id);
  return u;
}

async function mkBooking(o: {
  customerId?: string | null;
  guestEmail?: string;
  startsAt: Date;
  status?: 'CONFIRMED' | 'COMPLETED';
  createdAt?: Date;
}) {
  const id = randomUUID();
  const endsAt = new Date(o.startsAt.getTime() + 3_600_000);
  return db.booking.create({
    data: {
      id,
      reference: `SC-${tag().slice(0, 5).toUpperCase()}`,
      businessId: fx.businessId,
      serviceId: fx.serviceId,
      staffId: fx.staffIds[0]!,
      customerId: o.customerId ?? null,
      guestName: 'Real Name',
      guestEmail: o.guestEmail ?? `g-${tag()}@e2e.test`,
      guestPhone: '+35799333444',
      note: 'private note',
      startsAt: o.startsAt,
      endsAt,
      status: o.status ?? 'CONFIRMED',
      priceCents: 3000,
      manageTokenHash: manageTokenFor(id, endsAt).hash,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
  });
}

test('online booking stores both consents with the policy version; manual leaves them null', async () => {
  const res = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) });
  expect(res.ok).toBe(true);
  const b = await db.booking.findUniqueOrThrow({ where: { id: res.ok ? res.bookingId : '' } });
  expect(b.consentTermsAt).toBeTruthy();
  expect(b.consentMessagesAt).toBeTruthy();
  expect(b.consentVersion).toBe(CONSENT_VERSION);
  const m = await mkBooking({ startsAt: new Date(Date.now() + 9 * DAY) });
  expect(m.consentTermsAt).toBeNull();
});

test('export holds only the user data and no hashes', async () => {
  const u = await mkUser();
  const mine = await mkBooking({ customerId: u.id, startsAt: new Date(Date.now() + 5 * DAY) });
  const asGuest = await mkBooking({ guestEmail: u.email!.toUpperCase(), startsAt: new Date(Date.now() + 6 * DAY) });
  const theirs = await mkBooking({ startsAt: new Date(Date.now() + 7 * DAY) });
  await db.review.create({
    data: { businessId: fx.businessId, bookingId: mine.id, authorName: 'Gdpr', rating: 4, body: 'good' },
  });
  await db.favourite.create({ data: { userId: u.id, businessId: fx.businessId } });

  const out = buildExport((await loadExportRows(u.id))!);
  const json = JSON.stringify(out);
  expect(out.bookings.map((b) => b.reference).sort()).toEqual([mine.reference, asGuest.reference].sort());
  expect(json).not.toContain(theirs.reference);
  expect(json).not.toContain(theirs.guestEmail!);
  expect(json).not.toContain(mine.manageTokenHash);
  expect(json).not.toMatch(/Hash|"id"|token/i);
  expect(out.reviews).toHaveLength(1);
  expect(out.favourites).toEqual([{ business: `E2E Studio ${fx.slug.slice(4)}`, slug: fx.slug }]);
  expect(out.profile.email).toBe(u.email);
});

test('delete refuses owners and a wrong confirmation email', async () => {
  const owner = await db.user.findFirstOrThrow({ where: { businesses: { some: { id: fx.businessId } } } });
  expect(await deleteAccountCore(owner.id, owner.email!, new Date())).toEqual({ ok: false, code: 'OWNS_BUSINESS' });
  const u = await mkUser();
  expect(await deleteAccountCore(u.id, 'nope@e2e.test', new Date())).toEqual({ ok: false, code: 'EMAIL_MISMATCH' });
  expect(await db.user.count({ where: { id: u.id } })).toBe(1);
});

test('delete anonymises, cancels future bookings, frees the slot and keeps ratings', async () => {
  const u = await mkUser();
  const past = await mkBooking({ customerId: u.id, startsAt: new Date(Date.now() - 3 * DAY), status: 'COMPLETED' });
  await db.review.create({
    data: { businessId: fx.businessId, bookingId: past.id, authorName: 'Gdpr', rating: 5, body: 'lovely' },
  });
  await db.business.update({ where: { id: fx.businessId }, data: { ratingAvg: 5, ratingCount: 1 } });
  // The fixture slot (3 days out, 10:00) is held by this user's future booking.
  const future = await mkBooking({ customerId: u.id, startsAt: new Date(fx.slotIso) });
  await db.favourite.create({ data: { userId: u.id, businessId: fx.businessId } });
  await db.session.create({ data: { sessionToken: randomUUID(), userId: u.id, expires: new Date(Date.now() + DAY) } });

  const res = await deleteAccountCore(u.id, u.email!.toUpperCase(), new Date());
  expect(res).toMatchObject({ ok: true, bookings: 2, reviews: 1, businessIds: [fx.businessId] });

  expect(await db.user.count({ where: { id: u.id } })).toBe(0);
  expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  expect(await db.favourite.count({ where: { userId: u.id } })).toBe(0);
  const f = await db.booking.findUniqueOrThrow({ where: { id: future.id } });
  expect(f).toMatchObject({
    status: 'CANCELLED_BY_CUSTOMER',
    guestName: 'Deleted user',
    guestEmail: null,
    guestPhone: null,
    note: null,
    customerId: null,
  });
  expect((await db.booking.findUniqueOrThrow({ where: { id: past.id } })).status).toBe('COMPLETED');
  const r = await db.review.findUniqueOrThrow({ where: { bookingId: past.id } });
  expect(r).toMatchObject({ authorName: 'Former customer', body: null, rating: 5 });
  const biz = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
  expect([biz.ratingAvg, biz.ratingCount]).toEqual([5, 1]);
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'user.delete' }, orderBy: { createdAt: 'desc' } });
  expect(audit.actorId).toBeNull();
  expect(audit.meta).toEqual({ bookings: 2, reviews: 1 });

  // The slot is free again.
  const again = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) });
  expect(again.ok).toBe(true);
});

test('retention only touches rows past the cutoffs', async () => {
  const now = new Date();
  const old = new Date(now.getTime() - 800 * DAY);
  const recent = new Date(now.getTime() - 30 * DAY);
  const oldB = await mkBooking({ startsAt: old, status: 'COMPLETED' });
  const recentB = await mkBooking({ startsAt: recent, status: 'COMPLETED' });
  const pvData = { codeHash: 'x', expiresAt: now };
  const oldPv = await db.phoneVerification.create({
    data: { ...pvData, bookingId: recentB.id, createdAt: new Date(now.getTime() - 8 * DAY) },
  });
  const newPv = await db.phoneVerification.create({ data: { ...pvData, bookingId: recentB.id } });
  const oldLog = await db.notificationLog.create({
    data: { bookingId: recentB.id, channel: 'EMAIL', template: 't', status: 'sent', sentAt: old },
  });
  const newLog = await db.notificationLog.create({
    data: { bookingId: recentB.id, channel: 'EMAIL', template: 't', status: 'sent', sentAt: recent },
  });
  const tok = tag();
  await db.verificationToken.create({ data: { identifier: `${tok}@e2e.test`, token: `old-${tok}`, expires: new Date(now.getTime() - DAY) } });
  await db.verificationToken.create({ data: { identifier: `${tok}@e2e.test`, token: `new-${tok}`, expires: new Date(now.getTime() + DAY) } });
  const u = await mkUser();
  await db.session.create({ data: { sessionToken: `old-${tok}`, userId: u.id, expires: new Date(now.getTime() - DAY) } });
  await db.session.create({ data: { sessionToken: `new-${tok}`, userId: u.id, expires: new Date(now.getTime() + DAY) } });

  const counts = await runRetention(now);
  expect(counts.bookingsAnonymised).toBeGreaterThanOrEqual(1);

  expect(await db.phoneVerification.count({ where: { id: oldPv.id } })).toBe(0);
  expect(await db.phoneVerification.count({ where: { id: newPv.id } })).toBe(1);
  expect(await db.notificationLog.count({ where: { id: oldLog.id } })).toBe(0);
  expect(await db.notificationLog.count({ where: { id: newLog.id } })).toBe(1);
  expect(await db.verificationToken.count({ where: { token: { in: [`old-${tok}`] } } })).toBe(0);
  expect(await db.verificationToken.count({ where: { token: `new-${tok}` } })).toBe(1);
  expect(await db.session.count({ where: { sessionToken: `old-${tok}` } })).toBe(0);
  expect(await db.session.count({ where: { sessionToken: `new-${tok}` } })).toBe(1);
  expect(await db.booking.findUniqueOrThrow({ where: { id: oldB.id } })).toMatchObject({
    guestName: 'Deleted user',
    guestEmail: null,
    guestPhone: null,
    note: null,
  });
  expect((await db.booking.findUniqueOrThrow({ where: { id: recentB.id } })).guestEmail).toBeTruthy();
  await db.verificationToken.deleteMany({ where: { token: `new-${tok}` } });
});

test('the signed-in account page shows the export and delete sections', async ({ page, context }) => {
  const u = await mkUser();
  await signInAs(context, u.id);
  await page.goto('/en/account');
  await expect(page.getByRole('heading', { name: 'Download your data' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download my data' })).toHaveAttribute('href', '/api/account/export');
  const res = await context.request.get('/api/account/export');
  expect(res.headers()['content-disposition']).toContain('she-cy-data.json');
  expect(res.headers()['cache-control']).toBe('no-store');
  expect((await res.json()).profile.email).toBe(u.email);
});
