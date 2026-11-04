/**
 * DB-backed concurrency tests for booking creation (task 4.7, req 4.1, AC4).
 *
 * These call `createBookingRecord()` directly against a real Postgres database —
 * no mocking, no HTTP — which is the strongest guarantee for "at most one request
 * racing the same slot succeeds". They bypass the in-memory rate limiter in
 * app/actions/booking.ts by design (that limiter is exercised by the UI test in
 * booking-ui.spec.ts, not here).
 *
 * Run with Playwright so the whole suite has one entry point (`pnpm test:e2e`), but
 * these do not need a browser or the dev server; see playwright.config.ts webServer.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { createBookingRecord } from '../lib/booking';
import { createFixture, bookingInput, type Fixture } from './fixtures';

test.describe('createBookingRecord concurrency', () => {
  let fx: Fixture;

  test.afterEach(async () => {
    await fx?.cleanup();
  });

  test('N parallel requests for the same staff + same slot: exactly one succeeds', async () => {
    fx = await createFixture(1);
    const staffId = fx.staffIds[0]!;
    const N = 8;
    const inputs = Array.from({ length: N }, () => bookingInput(fx, { staffId }));

    const results = await Promise.all(inputs.map((input) => createBookingRecord({ input })));

    const ok = results.filter((r) => r.ok);
    const slotTaken = results.filter((r) => !r.ok && r.code === 'SLOT_TAKEN');
    expect(ok).toHaveLength(1);
    expect(slotTaken).toHaveLength(N - 1);

    const rows = await db.booking.findMany({ where: { businessId: fx.businessId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.staffId).toBe(staffId);
  });

  test('the same idempotency key submitted 5x in parallel creates exactly one booking', async () => {
    fx = await createFixture(1);
    const staffId = fx.staffIds[0]!;
    // Same idempotency key AND same details: a retried submit resends the identical
    // payload, so `replay()` (lib/booking.ts) can match it to the original booking.
    const idempotencyKey = randomUUID();
    const single = bookingInput(fx, { staffId, idempotencyKey });
    const inputs = Array.from({ length: 5 }, () => single);

    const results = await Promise.all(inputs.map((input) => createBookingRecord({ input })));

    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.bookingId : null)));
    expect(ids.size).toBe(1); // every reply points at the same booking

    const createdCount = results.filter((r) => r.ok && r.created).length;
    expect(createdCount).toBe(1); // only the winner actually created it; the rest replayed

    const rows = await db.booking.findMany({ where: { businessId: fx.businessId } });
    expect(rows).toHaveLength(1);
  });

  test('cancel then rebook the same slot succeeds', async () => {
    fx = await createFixture(1);
    const staffId = fx.staffIds[0]!;

    const first = await createBookingRecord({ input: bookingInput(fx, { staffId }) });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await db.booking.update({ where: { id: first.bookingId }, data: { status: 'CANCELLED_BY_CUSTOMER' } });

    const second = await createBookingRecord({ input: bookingInput(fx, { staffId }) });
    expect(second.ok).toBe(true);

    const rows = await db.booking.findMany({ where: { businessId: fx.businessId }, orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe('CANCELLED_BY_CUSTOMER');
    expect(rows[1]!.status).toBe('CONFIRMED');
  });

  test('"any" staff, 6 parallel requests, 2 staff: exactly 2 succeed, one per staff member', async () => {
    fx = await createFixture(2);
    const N = 6; // more requests than staff, so some must lose
    const inputs = Array.from({ length: N }, () => bookingInput(fx, { staffId: 'any' }));

    const results = await Promise.all(inputs.map((input) => createBookingRecord({ input })));
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(2); // one booking per staff member, no more

    const rows = await db.booking.findMany({ where: { businessId: fx.businessId } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.staffId)).size).toBe(2); // one each, not both on one staff
  });
});
