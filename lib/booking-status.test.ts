import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  checkTransition,
  isActiveStatus,
  isCancelledStatus,
  type BookingStatusName,
} from './booking-status';

const START = new Date('2026-07-15T10:00:00Z');
const BEFORE = new Date('2026-07-15T09:00:00Z');
const AFTER = new Date('2026-07-15T10:30:00Z');

describe('booking status transitions', () => {
  it('has exactly the owner transitions from the spec', () => {
    expect(allowedTransitions('PENDING')).toEqual(['CONFIRMED', 'CANCELLED_BY_BUSINESS']);
    expect(allowedTransitions('CONFIRMED')).toEqual([
      'COMPLETED',
      'NO_SHOW',
      'CANCELLED_BY_BUSINESS',
    ]);
  });

  it.each([
    'COMPLETED',
    'NO_SHOW',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_BUSINESS',
  ] as BookingStatusName[])('%s is terminal', (from) => {
    expect(allowedTransitions(from)).toEqual([]);
    expect(checkTransition(from, 'CONFIRMED', START, AFTER)).toBe('INVALID_TRANSITION');
  });

  it('rejects skipped or backwards moves', () => {
    expect(checkTransition('PENDING', 'COMPLETED', START, AFTER)).toBe(
      'INVALID_TRANSITION',
    );
    expect(checkTransition('PENDING', 'NO_SHOW', START, AFTER)).toBe(
      'INVALID_TRANSITION',
    );
    expect(checkTransition('CONFIRMED', 'PENDING', START, AFTER)).toBe(
      'INVALID_TRANSITION',
    );
    expect(checkTransition('CONFIRMED', 'CANCELLED_BY_CUSTOMER', START, AFTER)).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('only allows COMPLETED / NO_SHOW once the appointment has started', () => {
    expect(checkTransition('CONFIRMED', 'COMPLETED', START, BEFORE)).toBe('NOT_STARTED');
    expect(checkTransition('CONFIRMED', 'NO_SHOW', START, BEFORE)).toBe('NOT_STARTED');
    expect(checkTransition('CONFIRMED', 'COMPLETED', START, START)).toBe('OK');
    expect(checkTransition('CONFIRMED', 'COMPLETED', START, AFTER)).toBe('OK');
  });

  it('allows confirming and cancelling before the start', () => {
    expect(checkTransition('PENDING', 'CONFIRMED', START, BEFORE)).toBe('OK');
    expect(checkTransition('PENDING', 'CANCELLED_BY_BUSINESS', START, BEFORE)).toBe('OK');
    expect(checkTransition('CONFIRMED', 'CANCELLED_BY_BUSINESS', START, BEFORE)).toBe(
      'OK',
    );
  });

  it('classifies statuses', () => {
    expect(isActiveStatus('PENDING') && isActiveStatus('CONFIRMED')).toBe(true);
    expect(isActiveStatus('COMPLETED')).toBe(false);
    expect(
      isCancelledStatus('CANCELLED_BY_CUSTOMER') &&
        isCancelledStatus('CANCELLED_BY_BUSINESS'),
    ).toBe(true);
    expect(isCancelledStatus('NO_SHOW')).toBe(false);
  });
});
