import { beforeAll, describe, expect, it } from 'vitest';
import { isExclusionViolation, uniqueViolationOn } from './booking-errors';
import { daysBetweenKeys } from './booking';
import { slotStaffIds, type AvailabilityInput } from './availability';
import { generateReference } from './reference';
import { createManageToken, verifyManageToken } from './tokens';
import { zonedWallTimeToUtc } from './time';

describe('exclusion violation (23P01) detection', () => {
  it('recognises the SQLSTATE however Prisma surfaces it', () => {
    expect(isExclusionViolation({ code: '23P01' })).toBe(true);
    expect(isExclusionViolation({ code: 'P2010', meta: { code: '23P01' } })).toBe(true);
    expect(
      isExclusionViolation(
        new Error('conflicting key value violates exclusion constraint "booking_no_overlap"'),
      ),
    ).toBe(true);
    expect(isExclusionViolation(new Error('Raw query failed. Code: `23P01`'))).toBe(true);
  });
  it('ignores unrelated errors', () => {
    expect(isExclusionViolation(new Error('connection refused'))).toBe(false);
    expect(isExclusionViolation({ code: 'P2002' })).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
    expect(isExclusionViolation(undefined)).toBe(false);
  });
});

describe('unique violation (P2002) classification', () => {
  it('tells idempotencyKey from reference', () => {
    expect(uniqueViolationOn({ code: 'P2002', meta: { target: ['idempotencyKey'] } })).toBe('idempotencyKey');
    expect(uniqueViolationOn({ code: 'P2002', meta: { target: 'Booking_idempotencyKey_key' } })).toBe('idempotencyKey');
    expect(uniqueViolationOn({ code: 'P2002', meta: { target: ['reference'] } })).toBe('reference');
    expect(uniqueViolationOn({ code: 'P2002', meta: { target: ['id'] } })).toBe('other');
  });
  it('returns null for non-unique errors', () => {
    expect(uniqueViolationOn({ code: '23P01' })).toBeNull();
    expect(uniqueViolationOn(new Error('x'))).toBeNull();
  });
});

describe('booking reference', () => {
  it('is SC- plus 5 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(generateReference()).toMatch(/^SC-[A-HJ-NP-Z2-9]{5}$/);
  });
});

describe('manage token', () => {
  beforeAll(() => {
    process.env.MANAGE_TOKEN_SECRET = 'test-secret-for-vitest-only';
  });
  const future = () => Date.now() + 86_400_000;

  it('is deterministic for a booking and stores only a hash that differs from the token', () => {
    const exp = future();
    const a = createManageToken('b1', exp);
    const b = createManageToken('b1', exp);
    expect(a).toEqual(b); // lets an idempotent retry rebuild the same link
    expect(a.hash).not.toBe(a.token);
    expect(a.token.length).toBeGreaterThan(40);
  });
  it('verifies the right token, rejects tampered, other-booking and expired tokens', () => {
    const t = createManageToken('b1', future());
    expect(verifyManageToken(t.token, t.hash)).toBe(true);
    expect(verifyManageToken(`${t.token}x`, t.hash)).toBe(false);
    expect(verifyManageToken(createManageToken('b2', future()).token, t.hash)).toBe(false);
    const expired = createManageToken('b1', Date.now() - 1000);
    expect(verifyManageToken(expired.token, expired.hash)).toBe(false);
  });
});

describe('daysBetweenKeys', () => {
  it('counts calendar days across month and DST boundaries', () => {
    expect(daysBetweenKeys('2026-03-28', '2026-03-28')).toBe(0);
    expect(daysBetweenKeys('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetweenKeys('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetweenKeys('2026-04-02', '2026-04-01')).toBe(-1);
  });
});

describe('slotStaffIds (server re-validation input)', () => {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMin: 540, closesMin: 1020, closed: false }));
  const day = '2030-06-10';
  const base = (bookings: AvailabilityInput['bookings']): AvailabilityInput => ({
    now: new Date('2030-06-01T00:00:00Z'),
    settings: {
      slotIntervalMin: 30, bufferMin: 0, minLeadMin: 60, maxAdvanceDays: 365,
      cancellationWindowHours: 24, autoConfirm: true, maxPerCustomerPerDay: 3,
    },
    service: { durationMin: 60, bufferMin: 0 },
    staff: [{ id: 'a' }, { id: 'b' }],
    openingHours: hours,
    closures: [],
    bookings,
    blocks: [],
    fromDateKey: '2030-06-10',
    days: 1,
  });
  const at = zonedWallTimeToUtc(day, 600); // 10:00 local

  it('lists both staff when free, drops a booked one, and empty when all taken or off-grid', () => {
    expect(slotStaffIds(base([]), at).sort()).toEqual(['a', 'b']);
    const busyA = { staffId: 'a', startsAt: at, endsAt: new Date(at.getTime() + 3_600_000) };
    expect(slotStaffIds(base([busyA]), at)).toEqual(['b']);
    expect(slotStaffIds(base([busyA, { ...busyA, staffId: 'b' }]), at)).toEqual([]);
    expect(slotStaffIds(base([]), new Date(at.getTime() + 60_000))).toEqual([]);
  });
});
