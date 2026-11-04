import { describe, expect, it } from 'vitest';
import { zonedWallTimeToUtc } from './time';
import { isReminder24hDue, isReminder2hDue, isReviewRequestDue, queryWindow, type CandidateBooking } from './reminder-windows';

const H = 3_600_000;
const NOW = new Date('2026-06-10T09:00:00Z');
const at = (offsetH: number) => new Date(NOW.getTime() + offsetH * H);

const booking = (o: Partial<CandidateBooking> & { startH?: number }): CandidateBooking => {
  const startsAt = o.startsAt ?? at(o.startH ?? 24);
  return {
    status: 'CONFIRMED',
    createdAt: new Date(startsAt.getTime() - 72 * H),
    startsAt,
    endsAt: new Date(startsAt.getTime() + H),
    ...o,
  };
};

describe('reminder-24h', () => {
  it('is due inside (now+2h30m, now+24h]', () => {
    expect(isReminder24hDue(booking({ startH: 24 }), NOW)).toBe(true);
    expect(isReminder24hDue(booking({ startH: 23.5 }), NOW)).toBe(true);
    expect(isReminder24hDue(booking({ startH: 2.6 }), NOW)).toBe(true); // catch-up after a missed run
  });
  it('is not due too early or too late', () => {
    expect(isReminder24hDue(booking({ startH: 24.01 }), NOW)).toBe(false);
    expect(isReminder24hDue(booking({ startH: 2.5 }), NOW)).toBe(false);
    expect(isReminder24hDue(booking({ startH: -1 }), NOW)).toBe(false);
  });
  it('skips non-CONFIRMED bookings', () => {
    for (const status of ['PENDING', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_BUSINESS', 'COMPLETED', 'NO_SHOW']) {
      expect(isReminder24hDue(booking({ status }), NOW)).toBe(false);
    }
  });
  it('skips bookings created inside the final 24h', () => {
    const startsAt = at(20);
    expect(isReminder24hDue(booking({ startsAt, createdAt: new Date(startsAt.getTime() - 10 * H) }), NOW)).toBe(false);
    expect(isReminder24hDue(booking({ startsAt, createdAt: new Date(startsAt.getTime() - 24 * H) }), NOW)).toBe(true);
  });
});

describe('reminder-2h', () => {
  it('is due inside (now, now+2h]', () => {
    expect(isReminder2hDue(booking({ startH: 2 }), NOW)).toBe(true);
    expect(isReminder2hDue(booking({ startH: 0.1 }), NOW)).toBe(true);
  });
  it('is not due when past, too far, or not confirmed', () => {
    expect(isReminder2hDue(booking({ startH: 0 }), NOW)).toBe(false);
    expect(isReminder2hDue(booking({ startH: -0.5 }), NOW)).toBe(false);
    expect(isReminder2hDue(booking({ startH: 2.01 }), NOW)).toBe(false);
    expect(isReminder2hDue(booking({ startH: 1, status: 'PENDING' }), NOW)).toBe(false);
  });
  it('skips bookings created less than 2h before start', () => {
    const startsAt = at(1.5);
    expect(isReminder2hDue(booking({ startsAt, createdAt: new Date(startsAt.getTime() - 1 * H) }), NOW)).toBe(false);
    expect(isReminder2hDue(booking({ startsAt, createdAt: new Date(startsAt.getTime() - 2 * H) }), NOW)).toBe(true);
  });
});

describe('review-request', () => {
  const done = (endH: number, status = 'COMPLETED') =>
    booking({ status, startsAt: at(endH - 1), endsAt: at(endH) });
  it('is due 2h after the end, up to 7 days', () => {
    expect(isReviewRequestDue(done(-2), NOW)).toBe(true);
    expect(isReviewRequestDue(done(-24 * 6), NOW)).toBe(true);
  });
  it('is not due too early, too old, or not COMPLETED', () => {
    expect(isReviewRequestDue(done(-1.9), NOW)).toBe(false);
    expect(isReviewRequestDue(done(-24 * 7), NOW)).toBe(false);
    expect(isReviewRequestDue(done(-3, 'CONFIRMED'), NOW)).toBe(false);
    expect(isReviewRequestDue(done(-3, 'NO_SHOW'), NOW)).toBe(false);
  });
});

describe('DST independence (Europe/Nicosia)', () => {
  // Cyprus springs forward 2026-03-29 03:00 local and falls back 2026-10-25 04:00 local.
  it('24h window is exactly 24 real hours across spring-forward', () => {
    const start = zonedWallTimeToUtc('2026-03-29', 10 * 60); // 10:00 EEST (UTC+3) = 07:00Z
    const created = new Date(start.getTime() - 72 * H);
    // 24h before in absolute time is 2026-03-28T07:00Z (09:00 local the day before), not 10:00 local.
    const justInside = new Date(start.getTime() - 24 * H);
    const justOutside = new Date(start.getTime() - 24 * H - 1000);
    const bk = booking({ startsAt: start, createdAt: created });
    expect(isReminder24hDue(bk, justInside)).toBe(true);
    expect(isReminder24hDue(bk, justOutside)).toBe(false);
  });
  it('24h window is exactly 24 real hours across fall-back', () => {
    const start = zonedWallTimeToUtc('2026-10-25', 10 * 60); // 10:00 EET (UTC+2) = 08:00Z
    const created = new Date(start.getTime() - 72 * H);
    const bk = booking({ startsAt: start, createdAt: created });
    expect(isReminder24hDue(bk, new Date(start.getTime() - 24 * H))).toBe(true);
    expect(isReminder24hDue(bk, new Date(start.getTime() - 24 * H - 1000))).toBe(false);
  });
});

describe('queryWindow', () => {
  it('matches the predicates', () => {
    const w = queryWindow('reminder-2h', NOW);
    expect(w.field).toBe('startsAt');
    expect(w.gt.getTime()).toBe(NOW.getTime());
    expect(w.lte.getTime()).toBe(NOW.getTime() + 2 * H);
    expect(queryWindow('review-request', NOW).field).toBe('endsAt');
  });
});
