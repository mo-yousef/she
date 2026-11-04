/**
 * DB-backed tests for review submission, the phone OTP and owner replies (task 5.5,
 * req 2.2 / 7). Real Postgres; the lib cores behind the 'use server' wrappers are
 * called directly with explicit inputs (session user id, token, clock).
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { manageTokenFor } from '../lib/booking';
import { createOtpReceipt } from '../lib/review-otp';
import { removeReviewReplyCore, replyToReviewCore } from '../lib/review-reply';
import { loadReviewBooking, submitReviewCore } from '../lib/review-submit';
import { sendReviewOtp, verifyReviewOtp } from '../lib/review-verification';
import type { Notifier, PhoneMessage } from '../lib/notify/types';
import { createFixture, randomPhone, type Fixture } from './fixtures';

let fx: Fixture;
let ownerId: string;
const extraUsers: string[] = [];

test.beforeEach(async () => {
  fx = await createFixture();
  ownerId = (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } })).ownerId;
});
test.afterEach(async () => {
  await db.auditLog.deleteMany({ where: { businessId: fx.businessId } });
  await fx.cleanup();
  await db.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
});

async function makeBooking(
  o: { status?: 'COMPLETED' | 'CONFIRMED'; endsAt?: Date; customerId?: string; guestPhone?: string } = {},
) {
  const id = randomUUID();
  const endsAt = o.endsAt ?? new Date(Date.now() - 3 * 3_600_000);
  const startsAt = new Date(endsAt.getTime() - 3_600_000);
  const token = manageTokenFor(id, endsAt);
  const booking = await db.booking.create({
    data: {
      id,
      reference: `SC-${randomUUID().slice(0, 5).toUpperCase()}`,
      businessId: fx.businessId,
      serviceId: fx.serviceId,
      staffId: fx.staffIds[0]!,
      customerId: o.customerId,
      guestName: 'Maria Ioannou',
      guestPhone: o.guestPhone ?? randomPhone(),
      startsAt,
      endsAt,
      status: o.status ?? 'COMPLETED',
      priceCents: 3000,
      manageTokenHash: token.hash,
    },
  });
  return { booking, token: token.token };
}

const identity = (b: { reference: string }, token: string) => ({
  businessSlug: fx.slug,
  reference: b.reference,
  token,
});
const receiptFor = (bookingId: string) => createOtpReceipt(bookingId).token;

/** Notifier that records the OTP message instead of sending it. */
function capture() {
  const sent: PhoneMessage[] = [];
  const notifier: Notifier = {
    sendEmail: async () => ({ ok: false, channel: 'EMAIL', code: 'NOT_CONFIGURED' }),
    sendPhone: async (m) => {
      sent.push(m);
      return { ok: true, channel: 'SMS', providerId: 'test' };
    },
  };
  const lastCode = () => /\b(\d{6})\b/.exec(sent[sent.length - 1]!.body)![1]!;
  return { notifier, sent, lastCode };
}
const sendFor = (b: { id: string; guestPhone: string | null }, notifier: Notifier, now?: Date) =>
  sendReviewOtp({ id: b.id, guestPhone: b.guestPhone, locale: 'en', businessName: 'E2E Studio' }, { notifier, now, renderBody: (_l, _b, code) => `code ${code}` });

test.describe('review submission', () => {
  test('only a COMPLETED booking can be reviewed', async () => {
    const { booking, token } = await makeBooking({ status: 'CONFIRMED' });
    const res = await submitReviewCore(
      { ...identity(booking, token), receipt: receiptFor(booking.id), rating: 5 },
      { userId: null },
    );
    expect(res).toEqual({ ok: false, code: 'NOT_COMPLETED' });
    expect(await db.review.count({ where: { businessId: fx.businessId } })).toBe(0);
  });

  test('requires OTP proof for this very booking', async () => {
    const { booking, token } = await makeBooking();
    const other = await makeBooking();
    const base = { ...identity(booking, token), rating: 5 };
    expect(await submitReviewCore(base, { userId: null })).toEqual({ ok: false, code: 'VERIFICATION_REQUIRED' });
    // A receipt issued for a different booking is worthless here.
    expect(await submitReviewCore({ ...base, receipt: receiptFor(other.booking.id) }, { userId: null })).toEqual({
      ok: false,
      code: 'VERIFICATION_REQUIRED',
    });
    expect(await submitReviewCore({ ...base, receipt: 'garbage' }, { userId: null })).toEqual({
      ok: false,
      code: 'VERIFICATION_REQUIRED',
    });
  });

  test('completed booking + receipt creates a VISIBLE review; second review is ALREADY_REVIEWED', async () => {
    const { booking, token } = await makeBooking();
    const input = { ...identity(booking, token), receipt: receiptFor(booking.id), rating: 4, body: '  Lovely  ' };
    const first = await submitReviewCore(input, { userId: null });
    expect(first.ok).toBe(true);
    const row = await db.review.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(row).toMatchObject({ rating: 4, body: 'Lovely', status: 'VISIBLE', authorName: 'Maria I.' });

    expect(await submitReviewCore(input, { userId: null })).toEqual({ ok: false, code: 'ALREADY_REVIEWED' });
    expect(await db.review.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  test('concurrent duplicate submits yield exactly one review', async () => {
    const { booking, token } = await makeBooking();
    const input = { ...identity(booking, token), receipt: receiptFor(booking.id), rating: 5 };
    const results = await Promise.all(Array.from({ length: 5 }, () => submitReviewCore(input, { userId: null })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'ALREADY_REVIEWED')).toHaveLength(4);
    const biz = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
    expect(biz.ratingCount).toBe(1);
  });

  test('rating aggregates are recomputed from VISIBLE reviews only', async () => {
    const a = await makeBooking();
    const b = await makeBooking();
    const c = await makeBooking();
    // A pre-existing hidden review must not count.
    await db.review.create({
      data: { businessId: fx.businessId, bookingId: c.booking.id, authorName: 'X', rating: 1, status: 'HIDDEN' },
    });
    await submitReviewCore({ ...identity(a.booking, a.token), receipt: receiptFor(a.booking.id), rating: 5 }, { userId: null });
    await submitReviewCore({ ...identity(b.booking, b.token), receipt: receiptFor(b.booking.id), rating: 4 }, { userId: null });
    const biz = await db.business.findUniqueOrThrow({ where: { id: fx.businessId } });
    expect(biz.ratingCount).toBe(2);
    expect(biz.ratingAvg).toBeCloseTo(4.5, 5);
  });

  test('review window is enforced', async () => {
    const { booking, token } = await makeBooking({ endsAt: new Date(Date.now() - 86_400_000) });
    const later = new Date(Date.now() + 31 * 86_400_000);
    const res = await submitReviewCore(
      { ...identity(booking, token), receipt: receiptFor(booking.id), rating: 5 },
      { userId: null, now: later },
    );
    expect(res).toEqual({ ok: false, code: 'WINDOW_PASSED' });
  });

  test('signed-in customer with a verified matching phone skips the OTP', async () => {
    const phone = randomPhone();
    const user = await db.user.create({
      data: { email: `cust-${randomUUID().slice(0, 8)}@e2e.test`, phone, phoneVerifiedAt: new Date() },
    });
    extraUsers.push(user.id);
    const { booking, token } = await makeBooking({ customerId: user.id, guestPhone: phone });
    const input = { ...identity(booking, token), rating: 5 };
    // Someone else signed in (or a guest) still needs the OTP.
    expect(await submitReviewCore(input, { userId: null })).toEqual({ ok: false, code: 'VERIFICATION_REQUIRED' });
    expect((await submitReviewCore(input, { userId: user.id })).ok).toBe(true);
  });

  test('bad token or wrong slug leaks nothing and writes nothing', async () => {
    const { booking, token } = await makeBooking();
    const good = { ...identity(booking, token), receipt: receiptFor(booking.id), rating: 5 };
    expect(await loadReviewBooking({ businessSlug: fx.slug, reference: booking.reference, token: 'x.y' })).toBeNull();
    expect(await loadReviewBooking({ businessSlug: fx.slug, reference: booking.reference, token: undefined })).toBeNull();
    expect(await loadReviewBooking({ businessSlug: 'nope', reference: booking.reference, token })).toBeNull();
    expect(await loadReviewBooking({ businessSlug: fx.slug, reference: 'SC-ZZZZZ', token })).toBeNull();
    // Identical answer for every failure mode.
    const r1 = await submitReviewCore({ ...good, token: 'x.y' }, { userId: null });
    const r2 = await submitReviewCore({ ...good, reference: 'SC-ZZZZZ' }, { userId: null });
    expect(r1).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(r2).toEqual(r1);
    expect(await db.review.count({ where: { businessId: fx.businessId } })).toBe(0);
  });
});

test.describe('review OTP', () => {
  test('send delivers a localized code to the booking phone; only a hash is stored', async () => {
    const { booking } = await makeBooking();
    const { notifier, sent, lastCode } = capture();
    const res = await sendFor(booking, notifier);
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(booking.guestPhone);
    const row = await db.phoneVerification.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(row.codeHash).not.toContain(lastCode());
  });

  test('correct code is accepted once and cannot be reused', async () => {
    const { booking } = await makeBooking();
    const { notifier, lastCode } = capture();
    await sendFor(booking, notifier);
    const code = lastCode();
    const ok = await verifyReviewOtp(booking.id, code);
    expect(ok.ok).toBe(true);
    expect(await verifyReviewOtp(booking.id, code)).toMatchObject({ ok: false, code: 'NO_CODE' });
  });

  test('wrong codes count down, then the code is locked even for the right guess', async () => {
    const { booking } = await makeBooking();
    const { notifier, lastCode } = capture();
    await sendFor(booking, notifier);
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    expect(await verifyReviewOtp(booking.id, wrong)).toMatchObject({ ok: false, code: 'WRONG', attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) await verifyReviewOtp(booking.id, wrong);
    expect(await verifyReviewOtp(booking.id, wrong)).toMatchObject({ ok: false, code: 'LOCKED' });
    expect(await verifyReviewOtp(booking.id, right)).toMatchObject({ ok: false, code: 'LOCKED' });
  });

  test('parallel guesses cannot exceed the attempt cap', async () => {
    const { booking } = await makeBooking();
    const { notifier, lastCode } = capture();
    await sendFor(booking, notifier);
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    await Promise.all(Array.from({ length: 12 }, () => verifyReviewOtp(booking.id, wrong)));
    const row = await db.phoneVerification.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(row.attempts).toBe(5);
    expect(await verifyReviewOtp(booking.id, right)).toMatchObject({ ok: false, code: 'LOCKED' });
  });

  test('expired code is rejected', async () => {
    const { booking } = await makeBooking();
    const { notifier, lastCode } = capture();
    await sendFor(booking, notifier, new Date(Date.now() - 11 * 60_000));
    expect(await verifyReviewOtp(booking.id, lastCode())).toMatchObject({ ok: false, code: 'EXPIRED' });
  });

  test('resend cooldown applies; a new code invalidates the old one', async () => {
    const { booking } = await makeBooking();
    const { notifier, lastCode } = capture();
    await sendFor(booking, notifier);
    const first = lastCode();
    expect(await sendFor(booking, notifier)).toMatchObject({ ok: false, code: 'COOLDOWN' });
    // Backdate the first code past the cooldown, then resend.
    await db.phoneVerification.updateMany({
      where: { bookingId: booking.id },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    expect((await sendFor(booking, notifier)).ok).toBe(true);
    const second = lastCode();
    if (second !== first) expect(await verifyReviewOtp(booking.id, first)).toMatchObject({ ok: false });
    expect((await verifyReviewOtp(booking.id, second)).ok).toBe(true);
  });

  test('per-booking hourly send cap', async () => {
    const { booking } = await makeBooking();
    const { notifier } = capture();
    const base = Date.now() - 50 * 60_000;
    for (let i = 0; i < 3; i++) {
      expect((await sendFor(booking, notifier, new Date(base + i * 5 * 60_000))).ok).toBe(true);
    }
    expect(await sendFor(booking, notifier, new Date(base + 20 * 60_000))).toMatchObject({ ok: false, code: 'CAP' });
  });

  test('undelivered code answers SEND_FAILED and leaves nothing usable', async () => {
    const { booking } = await makeBooking();
    const failing: Notifier = {
      sendEmail: async () => ({ ok: false, channel: 'EMAIL', code: 'NOT_CONFIGURED' }),
      sendPhone: async () => ({ ok: false, channel: 'SMS', code: 'PROVIDER_ERROR' }),
    };
    expect(await sendFor(booking, failing)).toMatchObject({ ok: false, code: 'SEND_FAILED' });
    expect(await db.phoneVerification.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  test('full flow: OTP -> receipt -> review', async () => {
    const { booking, token } = await makeBooking();
    const { notifier, lastCode } = capture();
    await sendFor(booking, notifier);
    const verified = await verifyReviewOtp(booking.id, lastCode());
    if (!verified.ok) throw new Error('expected verified');
    const res = await submitReviewCore(
      { ...identity(booking, token), receipt: verified.receipt.token, rating: 5 },
      { userId: null },
    );
    expect(res.ok).toBe(true);
  });
});

test.describe('owner replies', () => {
  async function makeReview() {
    const { booking } = await makeBooking();
    return db.review.create({
      data: { businessId: fx.businessId, bookingId: booking.id, authorName: 'Maria I.', rating: 5, body: 'Nice' },
    });
  }
  const mkUser = async (role: 'OWNER' | 'STAFF') => {
    const u = await db.user.create({ data: { email: `u-${randomUUID().slice(0, 8)}@e2e.test`, role } });
    extraUsers.push(u.id);
    return u;
  };

  test('the business owner can reply, edit and remove; audit log has ids only', async () => {
    const review = await makeReview();
    expect(await replyToReviewCore(ownerId, { reviewId: review.id, body: '  Thank you!  ' })).toMatchObject({ ok: true });
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).ownerReply).toBe('Thank you!');
    expect(await replyToReviewCore(ownerId, { reviewId: review.id, body: 'Edited' })).toMatchObject({ ok: true });
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).ownerReply).toBe('Edited');
    expect(await removeReviewReplyCore(ownerId, { reviewId: review.id })).toMatchObject({ ok: true });
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).ownerReply).toBeNull();

    const logs = await db.auditLog.findMany({ where: { businessId: fx.businessId }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['review.reply', 'review.reply', 'review.reply.remove']);
    for (const l of logs) {
      expect(l.actorId).toBe(ownerId);
      expect(l.meta).toEqual({ reviewId: review.id });
    }
  });

  test('an owner of another business cannot reply or remove', async () => {
    const review = await makeReview();
    await replyToReviewCore(ownerId, { reviewId: review.id, body: 'Mine' });
    const other = await mkUser('OWNER');
    expect(await replyToReviewCore(other.id, { reviewId: review.id, body: 'Hijack' })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await removeReviewReplyCore(other.id, { reviewId: review.id })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).ownerReply).toBe('Mine');
  });

  test('staff and anonymous callers cannot reply; role is read from the DB', async () => {
    const review = await makeReview();
    const staff = await mkUser('STAFF');
    await db.staffMember.create({ data: { businessId: fx.businessId, userId: staff.id, name: 'Staffer' } });
    expect(await replyToReviewCore(staff.id, { reviewId: review.id, body: 'Hi' })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await replyToReviewCore(null, { reviewId: review.id, body: 'Hi' })).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    // Demoting the owner to STAFF removes the ability immediately.
    await db.user.update({ where: { id: ownerId }, data: { role: 'STAFF' } });
    expect(await replyToReviewCore(ownerId, { reviewId: review.id, body: 'Hi' })).toEqual({ ok: false, code: 'FORBIDDEN' });
    await db.user.update({ where: { id: ownerId }, data: { role: 'OWNER' } });
  });

  test('empty, whitespace and over-long replies are rejected', async () => {
    const review = await makeReview();
    for (const body of ['', '   ', 'a'.repeat(1001)]) {
      expect(await replyToReviewCore(ownerId, { reviewId: review.id, body })).toEqual({ ok: false, code: 'VALIDATION' });
    }
    expect(await replyToReviewCore(ownerId, { reviewId: 'nope', body: 'x' })).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
