/**
 * DB-backed tests for reviews management, booking rules and unpublish (task 6.8, req 5.1).
 * Real Postgres; cores are called directly with explicit user ids. No browser.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { computeAvailability } from '../lib/availability';
import { createBookingRecord, manageTokenFor } from '../lib/booking';
import { bookingInputSchema } from '../lib/booking-schema';
import { loadAvailabilityInput } from '../lib/booking-availability';
import { loadBookingsPage } from '../lib/bookings-data';
import { loadConfirmedBooking } from '../lib/booking-confirmation';
import { parseBookingsParams } from '../lib/bookings-params';
import { withinChangeWindow } from '../lib/manage-policy';
import { submitForReviewCore } from '../lib/onboarding';
import { MAX_OPEN_REPORTS } from '../lib/review-report';
import { reportReviewCore } from '../lib/review-manage';
import { lockBusiness, recomputeBusinessRating } from '../lib/review-rating';
import { replyToReviewCore } from '../lib/review-reply';
import { loadReviewsForDashboard } from '../lib/reviews-data';
import { REVIEWS_PAGE_SIZE, parseReviewsParams } from '../lib/reviews-params';
import { parseSettings } from '../lib/settings';
import { saveSettingsCore, unpublishCore } from '../lib/settings-save';
import { zonedWallTimeToUtc } from '../lib/time';
import { bookingInput, createFixture, randomPhone, type Fixture } from './fixtures';

let fx: Fixture;
let other: Fixture;
let ownerId: string;
let otherOwnerId: string;
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

const rules = (over: Record<string, unknown> = {}) => ({
  autoConfirm: true,
  slotIntervalMin: 30,
  bufferMin: 0,
  minLeadMin: 0,
  maxAdvanceDays: 60,
  cancellationWindowHours: 24,
  maxPerCustomerPerDay: 3,
  ...over,
});
const settingsOf = async (f: Fixture) => (await db.business.findUniqueOrThrow({ where: { id: f.businessId } })).settings;

test.describe('booking rules', () => {
  test('persists, merges unknown keys, rejects invalid with nothing written, audits field names only', async () => {
    await db.business.update({ where: { id: fx.businessId }, data: { settings: { legacyKey: 'keep', autoConfirm: true, minLeadMin: 0 } } });
    const ok = await saveSettingsCore(ownerId, fx.businessId, rules({ autoConfirm: false, maxAdvanceDays: 90 }));
    expect(ok).toMatchObject({ ok: true });
    expect(await settingsOf(fx)).toMatchObject({ legacyKey: 'keep', autoConfirm: false, maxAdvanceDays: 90 });
    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: fx.businessId, action: 'business.settings' } });
    expect(audit.meta).toEqual({ fields: expect.arrayContaining(['autoConfirm', 'maxAdvanceDays']) });
    expect(JSON.stringify(audit.meta)).not.toMatch(/90|false/);

    const before = await settingsOf(fx);
    const bad = await saveSettingsCore(ownerId, fx.businessId, rules({ bufferMin: 7, maxPerCustomerPerDay: 99 }));
    expect(bad).toMatchObject({ ok: false, code: 'VALIDATION', errors: { bufferMin: 'step', maxPerCustomerPerDay: 'range' } });
    expect(await settingsOf(fx)).toEqual(before);

    // Saving the same values again writes no audit row.
    const count = await db.auditLog.count({ where: { businessId: fx.businessId, action: 'business.settings' } });
    expect(await saveSettingsCore(ownerId, fx.businessId, rules({ autoConfirm: false, maxAdvanceDays: 90 }))).toMatchObject({ ok: true, fields: [] });
    expect(await db.auditLog.count({ where: { businessId: fx.businessId, action: 'business.settings' } })).toBe(count);
  });

  test('other owner is FORBIDDEN, anonymous is UNAUTHENTICATED', async () => {
    const before = await settingsOf(fx);
    expect(await saveSettingsCore(otherOwnerId, fx.businessId, rules())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await saveSettingsCore(null, fx.businessId, rules())).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await settingsOf(fx)).toEqual(before);
  });

  test('autoConfirm decides CONFIRMED vs PENDING for the next online booking', async () => {
    await saveSettingsCore(ownerId, fx.businessId, rules({ autoConfirm: true }));
    const a = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) });
    expect(a.ok).toBe(true);
    await saveSettingsCore(ownerId, fx.businessId, rules({ autoConfirm: false }));
    const b = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[1]! }) });
    expect(b.ok).toBe(true);
    const rows = await db.booking.findMany({ where: { businessId: fx.businessId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['CONFIRMED', 'PENDING']);
  });

  test('slotIntervalMin, minLeadMin and maxAdvanceDays change the availability output', async () => {
    const at8 = zonedWallTimeToUtc(fx.dateKey, 480);
    const slots = async (now: Date, days: number) => {
      const loaded = await loadAvailabilityInput({ businessId: fx.businessId, serviceId: fx.serviceId, days, now });
      return computeAvailability(loaded!.input);
    };
    await saveSettingsCore(ownerId, fx.businessId, rules({ slotIntervalMin: 30 }));
    const n30 = (await slots(at8, 1))[0]!.slots.length;
    await saveSettingsCore(ownerId, fx.businessId, rules({ slotIntervalMin: 60 }));
    const n60 = (await slots(at8, 1))[0]!.slots.length;
    expect(n60).toBeLessThan(n30);

    await saveSettingsCore(ownerId, fx.businessId, rules({ minLeadMin: 0 }));
    const first0 = (await slots(at8, 1))[0]!.slots[0]!.startsAt;
    await saveSettingsCore(ownerId, fx.businessId, rules({ minLeadMin: 180 }));
    const first180 = (await slots(at8, 1))[0]!.slots[0]!.startsAt;
    expect(first180.getTime() - first0.getTime()).toBeGreaterThanOrEqual(120 * 60_000);

    await saveSettingsCore(ownerId, fx.businessId, rules({ maxAdvanceDays: 1 }));
    const near = (await slots(new Date(), 10)).find((d) => d.dateKey === fx.dateKey)!;
    expect(near.slots).toHaveLength(0);
    // And the server-side create path rejects a booking beyond the window.
    expect(await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) })).toEqual({ ok: false, code: 'SLOT_TAKEN' });
    await saveSettingsCore(ownerId, fx.businessId, rules({ maxAdvanceDays: 30 }));
    expect((await slots(new Date(), 10)).find((d) => d.dateKey === fx.dateKey)!.slots.length).toBeGreaterThan(0);
  });

  test('cancellationWindowHours flows into the manage policy', async () => {
    await saveSettingsCore(ownerId, fx.businessId, rules({ cancellationWindowHours: 100 }));
    const s = parseSettings(await settingsOf(fx));
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    expect(withinChangeWindow(new Date(), startsAt, s.cancellationWindowHours)).toBe(false);
    await saveSettingsCore(ownerId, fx.businessId, rules({ cancellationWindowHours: 24 }));
    expect(withinChangeWindow(new Date(), startsAt, parseSettings(await settingsOf(fx)).cancellationWindowHours)).toBe(true);
  });

  test('maxPerCustomerPerDay: the next same-day booking by the same customer is DAILY_LIMIT', async () => {
    await saveSettingsCore(ownerId, fx.businessId, rules({ maxPerCustomerPerDay: 1 }));
    const first = bookingInput(fx, { staffId: fx.staffIds[0]! });
    const email = first.details.email;
    const second = (startsAt: string, email2: string, phone?: string) =>
      bookingInputSchema.parse({ ...first, startsAt, idempotencyKey: randomUUID(), details: { ...first.details, email: email2, phone: phone ?? first.details.phone } });
    expect((await createBookingRecord({ input: first })).ok).toBe(true);
    const later = new Date(new Date(fx.slotIso).getTime() + 2 * 3_600_000).toISOString();
    // Same email (case-insensitive), then same phone with another email: both counted as the same customer.
    expect(await createBookingRecord({ input: second(later, email.toUpperCase()) })).toEqual({ ok: false, code: 'DAILY_LIMIT' });
    expect(await createBookingRecord({ input: second(later, `x-${email}`) })).toEqual({ ok: false, code: 'DAILY_LIMIT' });
    // A different person is unaffected.
    expect((await createBookingRecord({ input: second(later, `y-${email}`, randomPhone()) })).ok).toBe(true);
    // A retry of the first submit is answered idempotently, not rejected.
    expect(await createBookingRecord({ input: first })).toMatchObject({ ok: true, created: false });
    // A cancelled booking frees the allowance.
    await db.booking.updateMany({ where: { businessId: fx.businessId, guestEmail: email }, data: { status: 'CANCELLED_BY_CUSTOMER' } });
    const evening = new Date(new Date(fx.slotIso).getTime() + 4 * 3_600_000).toISOString();
    expect((await createBookingRecord({ input: second(evening, email) })).ok).toBe(true);
  });

  test('maxPerCustomerPerDay is race-safe across different staff', async () => {
    await saveSettingsCore(ownerId, fx.businessId, rules({ maxPerCustomerPerDay: 1 }));
    const a = bookingInput(fx, { staffId: fx.staffIds[0]! });
    const b = bookingInputSchema.parse({ ...a, staffId: fx.staffIds[1]!, idempotencyKey: randomUUID() });
    const results = await Promise.all([createBookingRecord({ input: a }), createBookingRecord({ input: b })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'DAILY_LIMIT' }]);
    expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(1);
  });
});

async function makeReviews(f: Fixture, n: number, over: (i: number) => { status?: 'VISIBLE' | 'FLAGGED' | 'HIDDEN'; ownerReply?: string | null; rating?: number } = () => ({})) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    const endsAt = new Date(Date.now() - (i + 3) * 3_600_000 * 2);
    const booking = await db.booking.create({
      data: {
        id,
        reference: `SC-${randomUUID().slice(0, 5).toUpperCase()}`,
        businessId: f.businessId,
        serviceId: f.serviceId,
        staffId: f.staffIds[0]!,
        guestName: 'Maria Ioannou',
        guestPhone: randomPhone(),
        startsAt: new Date(endsAt.getTime() - 3_600_000),
        endsAt,
        status: 'COMPLETED',
        priceCents: 3000,
        manageTokenHash: manageTokenFor(id, endsAt).hash,
      },
    });
    const r = over(i);
    const review = await db.review.create({
      data: { businessId: f.businessId, bookingId: booking.id, authorName: 'Maria I.', rating: r.rating ?? 5, body: `Body ${i}`, status: r.status ?? 'VISIBLE', ownerReply: r.ownerReply ?? null, createdAt: new Date(Date.now() - i * 60_000) },
    });
    ids.push(review.id);
  }
  return ids;
}
const params = (raw: Record<string, string> = {}) => parseReviewsParams(raw);

test.describe('reviews management', () => {
  test('list is scoped to the business; filters and pagination slice correctly', async () => {
    await makeReviews(other, 3);
    const ids = await makeReviews(fx, REVIEWS_PAGE_SIZE + 3, (i) => (i === 0 ? { status: 'FLAGGED' } : i === 1 ? { ownerReply: 'Thanks' } : i === 2 ? { status: 'HIDDEN' } : {}));
    const all = await loadReviewsForDashboard(fx.businessId, params());
    expect(all.total).toBe(REVIEWS_PAGE_SIZE + 3);
    expect(all.reviews).toHaveLength(REVIEWS_PAGE_SIZE);
    expect(all.reviews.every((r) => ids.includes(r.id))).toBe(true); // never the other business's
    expect(all.reviews[0]!.id).toBe(ids[0]); // newest first
    const p2 = await loadReviewsForDashboard(fx.businessId, params({ page: '2' }));
    expect(p2.reviews).toHaveLength(3);
    expect((await loadReviewsForDashboard(fx.businessId, params({ page: '99' }))).page).toBe(2); // clamped
    const reported = await loadReviewsForDashboard(fx.businessId, params({ filter: 'reported' }));
    expect(reported.reviews.map((r) => r.id)).toEqual([ids[0]]);
    const replied = await loadReviewsForDashboard(fx.businessId, params({ filter: 'replied' }));
    expect(replied.reviews.map((r) => r.id)).toEqual([ids[1]]);
    const needs = await loadReviewsForDashboard(fx.businessId, params({ filter: 'needsReply' }));
    expect(needs.total).toBe(REVIEWS_PAGE_SIZE + 3 - 2); // not replied, not hidden (a reported one still needs a reply)
    expect(needs.reviews.some((r) => r.id === ids[2])).toBe(false);
    // Summary counts public reviews only (HIDDEN excluded): 22 of 23.
    expect(all.count).toBe(REVIEWS_PAGE_SIZE + 2);
    expect(all.reviews.find((r) => r.id === ids[0])!.verified).toBe(true);
  });

  test('owner reply still works through the existing core', async () => {
    const [id] = await makeReviews(fx, 1);
    expect(await replyToReviewCore(ownerId, { reviewId: id, body: 'Thank you!' })).toMatchObject({ ok: true });
    expect((await db.review.findUniqueOrThrow({ where: { id: id! } })).ownerReply).toBe('Thank you!');
    expect(await replyToReviewCore(otherOwnerId, { reviewId: id, body: 'nope' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  test('report: VISIBLE -> FLAGGED, idempotent, capped, tenant-scoped, HIDDEN untouchable, audit ids only', async () => {
    const ids = await makeReviews(fx, MAX_OPEN_REPORTS + 2, (i) => (i === MAX_OPEN_REPORTS + 1 ? { status: 'HIDDEN' } : {}));
    const [otherId] = await makeReviews(other, 1);
    const first = await reportReviewCore(ownerId, fx.businessId, { reviewId: ids[0], reason: 'spam' });
    expect(first).toMatchObject({ ok: true, alreadyFlagged: false });
    expect((await db.review.findUniqueOrThrow({ where: { id: ids[0]! } })).status).toBe('FLAGGED');
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: ids[0], reason: 'other' })).toMatchObject({ ok: true, alreadyFlagged: true });
    expect(await db.auditLog.count({ where: { businessId: fx.businessId, action: 'review.flag' } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: fx.businessId, action: 'review.flag' } });
    expect(audit.meta).toEqual({ reviewId: ids[0], reason: 'spam' });

    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: otherId, reason: 'spam' })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: ids[MAX_OPEN_REPORTS + 1], reason: 'spam' })).toEqual({ ok: false, code: 'NOT_ALLOWED' });
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: ids[1], reason: 'free text' })).toEqual({ ok: false, code: 'VALIDATION' });
    expect(await reportReviewCore(otherOwnerId, fx.businessId, { reviewId: ids[1], reason: 'spam' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await reportReviewCore(null, fx.businessId, { reviewId: ids[1], reason: 'spam' })).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

    for (let i = 1; i < MAX_OPEN_REPORTS; i++) expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: ids[i], reason: 'offensive' })).toMatchObject({ ok: true });
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: ids[MAX_OPEN_REPORTS], reason: 'spam' })).toEqual({ ok: false, code: 'LIMIT_REACHED' });
    expect((await db.review.findUniqueOrThrow({ where: { id: ids[MAX_OPEN_REPORTS]! } })).status).toBe('VISIBLE');
  });

  test('a FLAGGED review still counts publicly; a HIDDEN one does not (lock + recompute helpers)', async () => {
    const [a, b, c] = await makeReviews(fx, 3, (i) => ({ rating: [5, 3, 1][i]! }));
    const recompute = () => db.$transaction(async (tx) => { await lockBusiness(tx, fx.businessId); return recomputeBusinessRating(tx, fx.businessId); });
    expect(await recompute()).toEqual({ ratingAvg: 3, ratingCount: 3 });
    // Owner report: unchanged aggregates.
    expect(await reportReviewCore(ownerId, fx.businessId, { reviewId: c, reason: 'spam' })).toMatchObject({ ok: true });
    expect(await recompute()).toEqual({ ratingAvg: 3, ratingCount: 3 });
    expect(await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).toMatchObject({ ratingAvg: 3, ratingCount: 3 });
    // What 7.1 will do: HIDDEN under the lock, then recompute.
    await db.$transaction(async (tx) => {
      await lockBusiness(tx, fx.businessId);
      await tx.review.update({ where: { id: c }, data: { status: 'HIDDEN' } });
      await recomputeBusinessRating(tx, fx.businessId);
    });
    expect(await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).toMatchObject({ ratingAvg: 4, ratingCount: 2 });
    const dash = await loadReviewsForDashboard(fx.businessId, params());
    expect(dash.count).toBe(2);
    await db.$transaction(async (tx) => {
      await lockBusiness(tx, fx.businessId);
      await tx.review.update({ where: { id: c }, data: { status: 'VISIBLE' } });
      await recomputeBusinessRating(tx, fx.businessId);
    });
    expect(await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).toMatchObject({ ratingAvg: 3, ratingCount: 3 });
    void a; void b;
  });
});

test.describe('unpublish', () => {
  test('PUBLISHED -> DRAFT: booking stops, existing bookings stay reachable, re-submit works', async () => {
    const made = await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) });
    if (!made.ok) throw new Error('setup');
    const res = await unpublishCore(ownerId, fx.businessId);
    expect(res).toMatchObject({ ok: true, from: 'PUBLISHED' });
    expect((await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).status).toBe('DRAFT');
    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: fx.businessId, action: 'business.unpublish' } });
    expect(audit.meta).toEqual({ from: 'PUBLISHED', to: 'DRAFT' });

    // The public page and booking path only serve PUBLISHED.
    expect(await createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[1]! }) })).toEqual({ ok: false, code: 'VALIDATION' });
    expect(await db.business.count({ where: { slug: fx.slug, status: 'PUBLISHED' } })).toBe(0);
    // Existing bookings: dashboard list and the customer's manage link still work.
    const page = await loadBookingsPage(fx.businessId, parseBookingsParams({ status: 'all' }), 'en');
    expect(page.total).toBe(1);
    expect(await loadConfirmedBooking({ slug: fx.slug, reference: made.reference, token: made.manageToken })).not.toBeNull();

    // Not PUBLISHED/PENDING any more.
    expect(await unpublishCore(ownerId, fx.businessId)).toEqual({ ok: false, code: 'NOT_ALLOWED' });
    // Re-publish = submit for review; the checklist needs a photo, so it reports INCOMPLETE until added.
    expect(await submitForReviewCore(ownerId, fx.businessId)).toMatchObject({ ok: false, code: 'INCOMPLETE' });
    await db.photo.create({ data: { businessId: fx.businessId, url: 'https://res.cloudinary.com/x/image/upload/she/p.jpg', sortOrder: 0 } });
    await db.business.update({ where: { id: fx.businessId }, data: { address: '1 Test Street' } });
    expect(await submitForReviewCore(ownerId, fx.businessId)).toMatchObject({ ok: true, status: 'PENDING' });
    // PENDING can be withdrawn too.
    expect(await unpublishCore(ownerId, fx.businessId)).toMatchObject({ ok: true, from: 'PENDING' });
  });

  test('SUSPENDED is admin-only; other owner and anonymous are refused', async () => {
    expect(await unpublishCore(otherOwnerId, fx.businessId)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await unpublishCore(null, fx.businessId)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    await db.business.update({ where: { id: fx.businessId }, data: { status: 'SUSPENDED' } });
    expect(await unpublishCore(ownerId, fx.businessId)).toEqual({ ok: false, code: 'NOT_ALLOWED' });
    expect((await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).status).toBe('SUSPENDED');
  });

  test('race: unpublish vs online booking never crashes or strands', async () => {
    for (let i = 0; i < 3; i++) {
      await db.business.update({ where: { id: fx.businessId }, data: { status: 'PUBLISHED' } });
      await db.booking.deleteMany({ where: { businessId: fx.businessId } });
      const [u, b] = await Promise.all([unpublishCore(ownerId, fx.businessId), createBookingRecord({ input: bookingInput(fx, { staffId: fx.staffIds[0]! }) })]);
      expect(u.ok).toBe(true);
      expect((await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).status).toBe('DRAFT');
      const rows = await db.booking.count({ where: { businessId: fx.businessId } });
      expect(rows).toBe(b.ok ? 1 : 0); // either it landed before, or it was rejected: nothing in between
      if (!b.ok) expect(b.code).toBe('VALIDATION');
    }
  });
});
