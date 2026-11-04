/**
 * DB-backed tests for the admin area (task 7.1, req 5). Cores are called directly with explicit user
 * ids; one small browser smoke at the end. Serial: the role tests count ADMIN rows.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { manageTokenFor } from '../lib/booking';
import { recomputeBusinessRating } from '../lib/review-rating';
import { adminBusinessCore, adminReviewCore, adminSetRoleCore } from '../lib/admin';
import { loadAdminMetrics, loadAdminReviews } from '../lib/admin-data';
import { signInAs } from './auth';
import { randomPhone } from './fixtures';
import { collectBrowserErrors, createOwnerFixture, gotoReady, type OwnerFx } from './owner-helpers';
import { en } from './messages';

test.describe.configure({ mode: 'serial' });
let fx: OwnerFx;
const users: string[] = [];
async function makeUser(role: 'CUSTOMER' | 'OWNER' | 'ADMIN') {
  const email = `adm-${randomUUID().slice(0, 8)}@e2e.test`;
  const u = await db.user.create({ data: { email, name: 'E2E Admin', role } });
  users.push(u.id);
  return u.id;
}
async function makeReview(rating: number, status: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' = 'VISIBLE') {
  const endsAt = new Date(Date.now() - 6 * 3_600_000);
  const id = randomUUID();
  const booking = await db.booking.create({
    data: { id, manageTokenHash: manageTokenFor(id, endsAt).hash, reference: `SC-${randomUUID().slice(0, 5).toUpperCase()}`, businessId: fx.businessId, serviceId: fx.serviceId, staffId: fx.staffIds[0]!, guestName: 'Maria I.', guestPhone: randomPhone(), startsAt: new Date(endsAt.getTime() - 3_600_000), endsAt, status: 'COMPLETED', priceCents: 3000 },
  });
  return (await db.review.create({ data: { businessId: fx.businessId, bookingId: booking.id, authorName: 'Maria I.', rating, body: 'Body', status } })).id;
}
test.beforeEach(async () => {
  fx = await createOwnerFixture(1);
});
test.afterEach(async () => {
  await db.auditLog.deleteMany({ where: { OR: [{ businessId: fx.businessId }, { actorId: { in: users } }] } });
  await fx.cleanupAll();
  await db.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});
const ratingOf = async () => db.business.findUniqueOrThrow({ where: { id: fx.businessId }, select: { ratingAvg: true, ratingCount: true, status: true } });

test('non-admin, customer and anonymous are refused by every core', async () => {
  const cust = await makeUser('CUSTOMER');
  const reviewId = await makeReview(5);
  const target = await makeUser('CUSTOMER');
  for (const actor of [fx.ownerId, cust]) {
    expect(await adminBusinessCore(actor, fx.businessId, 'suspend')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await adminReviewCore(actor, reviewId, 'hide')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await adminSetRoleCore(actor, target, true)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  }
  expect(await adminBusinessCore(null, fx.businessId, 'suspend')).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  expect((await ratingOf()).status).toBe('PUBLISHED');
  expect((await db.user.findUniqueOrThrow({ where: { id: target } })).role).toBe('CUSTOMER');
});

test('approve refuses an incomplete listing and publishes a complete one; audit has ids and statuses only', async () => {
  const admin = await makeUser('ADMIN');
  const incomplete = await createOwnerFixture(1);
  try {
    await db.business.update({ where: { id: incomplete.businessId }, data: { status: 'PENDING', address: null } });
    const res = await adminBusinessCore(admin, incomplete.businessId, 'approve');
    expect(res).toMatchObject({ ok: false, code: 'INCOMPLETE', missing: ['address'] });
    expect((await db.business.findUniqueOrThrow({ where: { id: incomplete.businessId } })).status).toBe('PENDING');
  } finally {
    await incomplete.cleanupAll();
  }
  await db.business.update({ where: { id: fx.businessId }, data: { status: 'PENDING' } });
  expect(await adminBusinessCore(admin, fx.businessId, 'approve')).toMatchObject({ ok: true, from: 'PENDING', to: 'PUBLISHED' });
  expect((await ratingOf()).status).toBe('PUBLISHED');
  const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: fx.businessId, action: 'admin.business.approve' } });
  expect(audit).toMatchObject({ actorId: admin, meta: { from: 'PENDING', to: 'PUBLISHED' } });
  // Approving again is a stale-state refusal, not a second transition.
  expect(await adminBusinessCore(admin, fx.businessId, 'approve')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
});

test('reject, suspend and unsuspend follow the transition table', async () => {
  const admin = await makeUser('ADMIN');
  const set = (status: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'SUSPENDED') => db.business.update({ where: { id: fx.businessId }, data: { status } });
  await set('PENDING');
  expect(await adminBusinessCore(admin, fx.businessId, 'reject')).toMatchObject({ ok: true, to: 'DRAFT' });
  expect(await adminBusinessCore(admin, fx.businessId, 'suspend')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' }); // DRAFT
  await set('PUBLISHED');
  expect(await adminBusinessCore(admin, fx.businessId, 'unsuspend')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  expect(await adminBusinessCore(admin, fx.businessId, 'suspend')).toMatchObject({ ok: true, from: 'PUBLISHED', to: 'SUSPENDED' });
  expect(await adminBusinessCore(admin, fx.businessId, 'unsuspend')).toMatchObject({ ok: true, from: 'SUSPENDED', to: 'DRAFT' });
  expect(await adminBusinessCore(admin, 'does-not-exist', 'suspend')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  // @ts-expect-error unknown action must be rejected at runtime too
  expect(await adminBusinessCore(admin, fx.businessId, 'delete')).toMatchObject({ ok: false, code: 'VALIDATION' });
  const actions = (await db.auditLog.findMany({ where: { businessId: fx.businessId }, select: { action: true } })).map((a) => a.action).sort();
  expect(actions).toEqual(['admin.business.reject', 'admin.business.suspend', 'admin.business.unsuspend']);
});

test('review hide / restore / keep keep the rating aggregate exact and are audited by id', async () => {
  const admin = await makeUser('ADMIN');
  await makeReview(5);
  const one = await makeReview(1, 'FLAGGED');
  await db.$transaction(async (tx) => recomputeBusinessRating(tx, fx.businessId));
  expect(await ratingOf()).toMatchObject({ ratingCount: 2, ratingAvg: 3 });
  const open = await loadAdminReviews({ filter: 'flagged', page: 1 });
  expect(open.rows.map((r) => r.id)).toContain(one);
  expect(await adminReviewCore(admin, one, 'restore')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  expect(await adminReviewCore(admin, one, 'hide')).toMatchObject({ ok: true, from: 'FLAGGED', to: 'HIDDEN' });
  expect(await ratingOf()).toMatchObject({ ratingCount: 1, ratingAvg: 5 });
  expect(await adminReviewCore(admin, one, 'restore')).toMatchObject({ ok: true, to: 'VISIBLE' });
  expect(await ratingOf()).toMatchObject({ ratingCount: 2, ratingAvg: 3 });
  await db.review.update({ where: { id: one }, data: { status: 'FLAGGED' } });
  expect(await adminReviewCore(admin, one, 'keep')).toMatchObject({ ok: true, from: 'FLAGGED', to: 'VISIBLE' });
  expect(await adminReviewCore(admin, 'nope', 'hide')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  const audit = await db.auditLog.findMany({ where: { businessId: fx.businessId, action: { startsWith: 'admin.review.' } }, orderBy: { createdAt: 'asc' } });
  expect(audit.map((a) => a.action)).toEqual(['admin.review.hide', 'admin.review.restore', 'admin.review.keep']);
  expect(audit[0]!.meta).toEqual({ reviewId: one, from: 'FLAGGED', to: 'HIDDEN' });
  expect(JSON.stringify(audit.map((a) => a.meta))).not.toMatch(/Maria|Body|@/);
});

test('flagged review list shows the latest report reason from the audit row', async () => {
  const id = await makeReview(2, 'FLAGGED');
  await db.auditLog.create({ data: { businessId: fx.businessId, action: 'review.flag', meta: { reviewId: id, reason: 'spam' } } });
  const { rows } = await loadAdminReviews({ filter: 'flagged', page: 1 });
  expect(rows.find((r) => r.id === id)?.reason).toBe('spam');
});

test('role guards: self-demote refused; promote/demote audited; two admins cannot demote each other', async () => {
  const others = await db.user.count({ where: { role: 'ADMIN' } });
  const a = await makeUser('ADMIN');
  const target = await makeUser('CUSTOMER');
  expect(await adminSetRoleCore(a, a, false)).toMatchObject({ ok: false, code: 'SELF_DEMOTE' });
  expect(await adminSetRoleCore(a, target, false)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  expect(await adminSetRoleCore(a, target, true)).toMatchObject({ ok: true, from: 'CUSTOMER', to: 'ADMIN' });
  expect(await adminSetRoleCore(a, target, true)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  // Demotion returns to OWNER for business owners, CUSTOMER otherwise.
  expect(await adminSetRoleCore(a, target, false)).toMatchObject({ ok: true, to: 'CUSTOMER' });
  const audit = await db.auditLog.findFirstOrThrow({ where: { actorId: a, action: 'admin.user.role' }, orderBy: { createdAt: 'asc' } });
  expect(audit.meta).toEqual({ userId: target, from: 'CUSTOMER', to: 'ADMIN' });
  if (others === 0) {
    const b = await makeUser('ADMIN');
    const [r1, r2] = await Promise.all([adminSetRoleCore(a, b, false), adminSetRoleCore(b, a, false)]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1); // the last admin always survives
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  }
});

test('browser: an admin opens every admin page; a non-admin gets 404', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await makeUser('ADMIN');
  const context = await browser.newContext();
  await signInAs(context, admin);
  const page = await context.newPage();
  const errors = collectBrowserErrors(page);
  const a = en.admin;
  const routes: [string, string][] = [['admin', a.overview.title], ['admin/businesses', a.businesses.title], ['admin/reviews', a.reviews.title], ['admin/users', a.users.title]];
  for (const [route, title] of routes) {
    const res = await page.goto(`/en/${route}`);
    expect.soft(res?.status(), route).toBe(200);
    await gotoReady(page, `/en/${route}`, (p) => p.getByRole('heading', { level: 1, name: title, exact: true }));
  }
  expect(errors()).toEqual([]);
  await context.close();
  const owner = await browser.newContext();
  await signInAs(owner, fx.ownerId);
  const res = await (await owner.newPage()).goto('/en/admin');
  expect(res?.status()).toBe(404);
  await owner.close();
  // Metrics query runs against the real DB.
  expect((await loadAdminMetrics()).status.PUBLISHED).toBeGreaterThanOrEqual(1);
});
