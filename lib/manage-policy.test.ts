import { describe, it, expect } from 'vitest';
import { withinChangeWindow, isChangeableStatus, needsNewToken, tokenExpiry } from './manage-policy';

/** Validates: Requirement 3.2 */
describe('withinChangeWindow', () => {
  const start = new Date('2026-01-10T12:00:00Z');

  it('is true when now is well before the window', () => {
    const now = new Date('2026-01-08T12:00:00Z'); // 48h before
    expect(withinChangeWindow(now, start, 24)).toBe(true);
  });

  it('is true exactly at the cutoff (boundary is inclusive)', () => {
    const now = new Date('2026-01-09T12:00:00Z'); // exactly 24h before
    expect(withinChangeWindow(now, start, 24)).toBe(true);
  });

  it('is false one minute past the cutoff', () => {
    const now = new Date('2026-01-09T12:01:00Z'); // 23h59m before
    expect(withinChangeWindow(now, start, 24)).toBe(false);
  });

  it('is false once the appointment has started', () => {
    const now = new Date('2026-01-10T12:00:01Z');
    expect(withinChangeWindow(now, start, 0)).toBe(false);
  });

  it('is true for a zero-hour window right up to the start', () => {
    const now = new Date('2026-01-10T11:59:59Z');
    expect(withinChangeWindow(now, start, 0)).toBe(true);
  });
});

describe('isChangeableStatus', () => {
  it('allows PENDING and CONFIRMED', () => {
    expect(isChangeableStatus('PENDING')).toBe(true);
    expect(isChangeableStatus('CONFIRMED')).toBe(true);
  });

  it('rejects completed, cancelled and no-show', () => {
    expect(isChangeableStatus('COMPLETED')).toBe(false);
    expect(isChangeableStatus('CANCELLED_BY_CUSTOMER')).toBe(false);
    expect(isChangeableStatus('CANCELLED_BY_BUSINESS')).toBe(false);
    expect(isChangeableStatus('NO_SHOW')).toBe(false);
  });
});

describe('needsNewToken', () => {
  const grace = 1000;

  it('false when the old expiry still covers the new end + grace', () => {
    const newEndsAt = new Date(5000);
    expect(needsNewToken(6000, newEndsAt, grace)).toBe(false);
  });

  it('true when the appointment moved past the old token expiry', () => {
    const newEndsAt = new Date(10_000);
    expect(needsNewToken(6000, newEndsAt, grace)).toBe(true);
  });
});

describe('tokenExpiry', () => {
  it('parses the leading expiry segment', () => {
    expect(tokenExpiry('1700000000000.abc123')).toBe(1700000000000);
  });

  it('is NaN for a malformed token', () => {
    expect(Number.isNaN(tokenExpiry('garbage'))).toBe(true);
  });
});
