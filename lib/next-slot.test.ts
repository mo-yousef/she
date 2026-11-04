import { describe, it, expect } from 'vitest';
import { availabilityTag, nextSlotKeyParts, pickNextSlotIso } from './next-slot';
import type { DayAvailability } from './availability';

const slot = (iso: string) => ({
  startsAt: new Date(iso),
  endsAt: new Date(new Date(iso).getTime() + 3_600_000),
  availableStaffIds: ['s1'],
});

describe('pickNextSlotIso', () => {
  it('returns the first slot of the first day that has one', () => {
    const days: DayAvailability[] = [
      { dateKey: '2026-06-01', slots: [] },
      { dateKey: '2026-06-02', slots: [slot('2026-06-02T07:00:00.000Z'), slot('2026-06-02T08:00:00.000Z')] },
      { dateKey: '2026-06-03', slots: [slot('2026-06-03T07:00:00.000Z')] },
    ];
    expect(pickNextSlotIso(days)).toBe('2026-06-02T07:00:00.000Z');
  });

  it('returns null when no day has a slot', () => {
    expect(pickNextSlotIso([{ dateKey: '2026-06-01', slots: [] }])).toBeNull();
    expect(pickNextSlotIso([])).toBeNull();
  });
});

describe('cache identity', () => {
  it('tag matches the documented invalidation format', () => {
    expect(availabilityTag('abc')).toBe('business:abc:availability');
  });

  it('key is per business and per local date', () => {
    expect(nextSlotKeyParts('abc', '2026-06-01')).not.toEqual(nextSlotKeyParts('abc', '2026-06-02'));
    expect(nextSlotKeyParts('abc', '2026-06-01')).not.toEqual(nextSlotKeyParts('xyz', '2026-06-01'));
  });
});
