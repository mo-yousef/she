/**
 * DB-backed tests for the notification cron (task 5.3, req 6). Real Postgres, no
 * HTTP, no browser — calls `runNotificationCron` directly like
 * booking-concurrency.spec.ts calls `createBookingRecord`.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { manageTokenFor } from '../lib/booking';
import { runNotificationCron } from '../lib/notification-cron';
import { createFixture, randomPhone, type Fixture } from './fixtures';

const H = 3_600_000;

/**
 * Injected sender (the real one pulls in the React Email templates, which Playwright's
 * plain-Node ESM loader cannot import; templates and sendBookingReminder are covered by
 * Vitest). Records every call and returns the given outcome.
 */
function spySend(outcome: 'done' | 'retry' = 'done') {
  const calls: Array<{ kind: string; id: string }> = [];
  const send = async (kind: string, id: string) => {
    calls.push({ kind, id });
    return outcome;
  };
  return { calls, send };
}

async function makeBooking(
  fx: Fixture,
  o: { status: string; startsAt: Date; endsAt?: Date; createdAt: Date; source?: 'ONLINE' | 'MANUAL' },
) {
  const id = randomUUID();
  const endsAt = o.endsAt ?? new Date(o.startsAt.getTime() + H);
  const token = manageTokenFor(id, endsAt);
  return db.booking.create({
    data: {
      id,
      reference: `SC-${randomUUID().slice(0, 5).toUpperCase()}`,
      businessId: fx.businessId,
      serviceId: fx.serviceId,
      staffId: fx.staffIds[0]!,
      guestName: 'E2E Customer',
      guestEmail: `customer-${id.slice(0, 8)}@e2e.test`,
      guestPhone: randomPhone(),
      startsAt: o.startsAt,
      endsAt,
      status: o.status as never,
      priceCents: 3000,
      source: o.source ?? 'ONLINE',
      locale: 'en',
      manageTokenHash: token.hash,
      createdAt: o.createdAt,
    },
  });
}

test.describe('runNotificationCron', () => {
  let fx: Fixture;

  test.afterEach(async () => {
    await fx?.cleanup();
  });

  test('claims and notifies an eligible booking exactly once across two parallel runs', async () => {
    fx = await createFixture(1);
    const now = new Date();
    const booked = await makeBooking(fx, {
      status: 'CONFIRMED',
      startsAt: new Date(now.getTime() + 24 * H),
      createdAt: new Date(now.getTime() - 48 * H),
    });

    const { calls, send } = spySend('done');
    const [a, b] = await Promise.all([
      runNotificationCron({ now, send, batch: 50 }),
      runNotificationCron({ now, send, batch: 50 }),
    ]);

    expect(a.reminder24h + b.reminder24h).toBe(1);
    expect(calls).toHaveLength(1); // claimed and sent exactly once, not twice
    expect(calls[0]).toEqual({ kind: 'reminder-24h', id: booked.id });

    const row = await db.booking.findUniqueOrThrow({ where: { id: booked.id } });
    expect(row.reminder24SentAt).not.toBeNull();
    expect(row.reminder2SentAt).toBeNull();
  });

  test('a hard-failed send releases the claim so the next run retries', async () => {
    fx = await createFixture(1);
    const now = new Date();
    const booked = await makeBooking(fx, {
      status: 'CONFIRMED',
      startsAt: new Date(now.getTime() + H), // due for the 2h reminder
      createdAt: new Date(now.getTime() - 48 * H),
    });

    const failing = spySend('retry');
    const first = await runNotificationCron({ now, send: failing.send, batch: 50 });
    expect(first.reminder2h).toBe(0);
    expect(first.failed).toBe(1);
    let row = await db.booking.findUniqueOrThrow({ where: { id: booked.id } });
    expect(row.reminder2SentAt).toBeNull(); // claim released

    const succeeding = spySend('done');
    const second = await runNotificationCron({ now, send: succeeding.send, batch: 50 });
    expect(second.reminder2h).toBe(1);
    row = await db.booking.findUniqueOrThrow({ where: { id: booked.id } });
    expect(row.reminder2SentAt).not.toBeNull();
  });

  test('leaves ineligible bookings untouched: cancelled, pending, too far out, created-late', async () => {
    fx = await createFixture(1);
    const now = new Date();
    const cancelled = await makeBooking(fx, {
      status: 'CANCELLED_BY_CUSTOMER',
      startsAt: new Date(now.getTime() + 24 * H),
      createdAt: new Date(now.getTime() - 48 * H),
    });
    const pending = await makeBooking(fx, {
      status: 'PENDING',
      startsAt: new Date(now.getTime() + 24 * H),
      createdAt: new Date(now.getTime() - 48 * H),
    });
    const tooFarOut = await makeBooking(fx, {
      status: 'CONFIRMED',
      startsAt: new Date(now.getTime() + 48 * H),
      createdAt: new Date(now.getTime() - 72 * H),
    });
    // Booked 21h before a start 20h away: inside the final 24h, so the 24h reminder
    // would be redundant (the confirmation was the heads-up).
    const createdLate = await makeBooking(fx, {
      status: 'CONFIRMED',
      startsAt: new Date(now.getTime() + 20 * H),
      createdAt: new Date(now.getTime() - 1 * H),
    });

    const { calls, send } = spySend('done');
    const counts = await runNotificationCron({ now, send, batch: 50 });

    expect(counts).toEqual({ reminder24h: 0, reminder2h: 0, reviewRequest: 0, failed: 0 });
    expect(calls).toHaveLength(0);

    for (const b of [cancelled, pending, tooFarOut, createdLate]) {
      const row = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
      expect(row.reminder24SentAt).toBeNull();
      expect(row.reminder2SentAt).toBeNull();
    }
  });

  test('a completed booking past the review delay gets exactly one review request', async () => {
    fx = await createFixture(1);
    const now = new Date();
    const completed = await makeBooking(fx, {
      status: 'COMPLETED',
      startsAt: new Date(now.getTime() - 4 * H),
      endsAt: new Date(now.getTime() - 3 * H),
      createdAt: new Date(now.getTime() - 48 * H),
    });

    const { calls, send } = spySend('done');
    const [a, b] = await Promise.all([
      runNotificationCron({ now, send, batch: 50 }),
      runNotificationCron({ now, send, batch: 50 }),
    ]);

    expect(a.reviewRequest + b.reviewRequest).toBe(1);
    expect(calls).toHaveLength(1);
    const row = await db.booking.findUniqueOrThrow({ where: { id: completed.id } });
    expect(row.reviewRequestedAt).not.toBeNull();
  });
});
