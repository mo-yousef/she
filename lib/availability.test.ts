import { describe, it, expect } from 'vitest';
import {
  computeAvailability,
  isSlotAvailable,
  pickStaffForSlot,
  type AvailabilityInput,
  type BusinessSettings,
  type OpeningHour,
} from './availability';
import { zonedWallTimeToUtc } from './time';

const TZ = 'Europe/Nicosia';

const settings: BusinessSettings = {
  slotIntervalMin: 30,
  bufferMin: 0,
  minLeadMin: 60,
  maxAdvanceDays: 60,
  cancellationWindowHours: 24,
  autoConfirm: true,
  maxPerCustomerPerDay: 3,
};

// Mon–Sun, open 09:00–17:00, closed Sunday (weekday 0).
function standardHours(): OpeningHour[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensMin: 9 * 60,
    closesMin: 17 * 60,
    closed: weekday === 0,
  }));
}

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    // A Wednesday well before any DST edge; "now" early so lead time is harmless.
    now: zonedWallTimeToUtc('2026-06-10', 6 * 60, TZ), // 06:00 local Wed
    timezone: TZ,
    settings,
    service: { durationMin: 60, bufferMin: 0 },
    staff: [{ id: 'alice' }],
    openingHours: standardHours(),
    closures: [],
    bookings: [],
    blocks: [],
    fromDateKey: '2026-06-10',
    days: 1,
    ...overrides,
  };
}

describe('computeAvailability — normal day', () => {
  it('produces a slot every 30 min that fits before close', () => {
    const [day] = computeAvailability(baseInput());
    expect(day?.dateKey).toBe('2026-06-10');
    // 09:00..16:00 starts for a 60-min service on a 30-min grid closing 17:00.
    // Last valid start is 16:00 (16:00+60=17:00). 09:00,09:30,...,16:00 = 15 slots.
    expect(day?.slots.length).toBe(15);
    expect(day?.slots[0]?.startsAt.getTime()).toBe(
      zonedWallTimeToUtc('2026-06-10', 9 * 60, TZ).getTime(),
    );
    const last = day?.slots[day.slots.length - 1];
    expect(last?.startsAt.getTime()).toBe(
      zonedWallTimeToUtc('2026-06-10', 16 * 60, TZ).getTime(),
    );
  });
});

describe('buffer and close boundary', () => {
  it('a trailing buffer reduces the last usable start', () => {
    const [day] = computeAvailability(
      baseInput({ service: { durationMin: 60, bufferMin: 30 } }),
    );
    // Needs 90 min before 17:00 → last start 15:30. 09:00..15:30 = 14 slots.
    expect(day?.slots.length).toBe(14);
    const last = day?.slots[day.slots.length - 1];
    expect(last?.startsAt.getTime()).toBe(
      zonedWallTimeToUtc('2026-06-10', 15 * 60 + 30, TZ).getTime(),
    );
  });
});

describe('minimum lead time', () => {
  it('hides slots earlier than now + minLeadMin', () => {
    // now = 10:10 local; minLead 60 → earliest bookable 11:10 → first grid slot 11:30.
    const [day] = computeAvailability(
      baseInput({ now: zonedWallTimeToUtc('2026-06-10', 10 * 60 + 10, TZ) }),
    );
    expect(day?.slots[0]?.startsAt.getTime()).toBe(
      zonedWallTimeToUtc('2026-06-10', 11 * 60 + 30, TZ).getTime(),
    );
  });
});

describe('closed days and closures', () => {
  it('returns no slots on a weekly closed day (Sunday)', () => {
    const [day] = computeAvailability(
      baseInput({ fromDateKey: '2026-06-14', now: zonedWallTimeToUtc('2026-06-14', 6 * 60, TZ) }),
    );
    expect(day?.dateKey).toBe('2026-06-14'); // Sunday
    expect(day?.slots.length).toBe(0);
  });

  it('returns no slots inside a holiday closure range', () => {
    const [day] = computeAvailability(
      baseInput({ closures: [{ from: '2026-06-10', to: '2026-06-12' }] }),
    );
    expect(day?.slots.length).toBe(0);
  });
});

describe('existing bookings and blocks', () => {
  it('removes slots that overlap a booking (buffer included)', () => {
    const booking = {
      staffId: 'alice',
      startsAt: zonedWallTimeToUtc('2026-06-10', 10 * 60, TZ),
      endsAt: zonedWallTimeToUtc('2026-06-10', 11 * 60, TZ),
    };
    const [day] = computeAvailability(baseInput({ bookings: [booking] }));
    const starts = day!.slots.map((s) => s.startsAt.getTime());
    // 10:00 start overlaps directly; 09:30 start (09:30–10:30) also overlaps.
    expect(starts).not.toContain(zonedWallTimeToUtc('2026-06-10', 10 * 60, TZ).getTime());
    expect(starts).not.toContain(
      zonedWallTimeToUtc('2026-06-10', 9 * 60 + 30, TZ).getTime(),
    );
    // 11:00 start (11:00–12:00) does NOT overlap a 10:00–11:00 booking (half-open).
    expect(starts).toContain(zonedWallTimeToUtc('2026-06-10', 11 * 60, TZ).getTime());
  });

  it('a block behaves like a booking', () => {
    const block = {
      staffId: 'alice',
      startsAt: zonedWallTimeToUtc('2026-06-10', 12 * 60, TZ),
      endsAt: zonedWallTimeToUtc('2026-06-10', 13 * 60, TZ),
    };
    const [day] = computeAvailability(baseInput({ blocks: [block] }));
    const starts = day!.slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(zonedWallTimeToUtc('2026-06-10', 12 * 60, TZ).getTime());
  });
});

describe('any-available across multiple staff', () => {
  it('offers a slot if at least one staff member is free', () => {
    const input = baseInput({
      staff: [{ id: 'alice' }, { id: 'bob' }],
      bookings: [
        {
          staffId: 'alice',
          startsAt: zonedWallTimeToUtc('2026-06-10', 9 * 60, TZ),
          endsAt: zonedWallTimeToUtc('2026-06-10', 10 * 60, TZ),
        },
      ],
    });
    const [day] = computeAvailability(input);
    const nine = day!.slots.find(
      (s) => s.startsAt.getTime() === zonedWallTimeToUtc('2026-06-10', 9 * 60, TZ).getTime(),
    );
    // Alice busy, Bob free → slot exists with only Bob available.
    expect(nine?.availableStaffIds).toEqual(['bob']);
  });
});

describe('pickStaffForSlot — least booked first', () => {
  it('chooses the staff member with the fewest bookings', () => {
    const counts = new Map([
      ['alice', 5],
      ['bob', 2],
    ]);
    expect(pickStaffForSlot(['alice', 'bob'], counts)).toBe('bob');
  });
});

describe('isSlotAvailable — server re-validation', () => {
  it('returns true for an offered slot and false after it is taken', () => {
    const input = baseInput();
    const start = zonedWallTimeToUtc('2026-06-10', 9 * 60, TZ);
    expect(isSlotAvailable(input, { startsAt: start, staffId: 'alice' })).toBe(true);

    const taken = baseInput({
      bookings: [
        {
          staffId: 'alice',
          startsAt: start,
          endsAt: zonedWallTimeToUtc('2026-06-10', 10 * 60, TZ),
        },
      ],
    });
    expect(isSlotAvailable(taken, { startsAt: start, staffId: 'alice' })).toBe(false);
  });
});

/**
 * DST edge cases for Europe/Nicosia (mandatory, requirement 4.2 / AC10).
 * Cyprus springs forward on the last Sunday of March (local 03:00 → 04:00) and
 * falls back on the last Sunday of October (local 04:00 → 03:00).
 */
describe('DST transitions — Europe/Nicosia', () => {
  it('spring forward: 2026-03-29, 10:00 local maps to a correct UTC instant', () => {
    // After spring-forward Cyprus is UTC+3, so 10:00 local = 07:00Z.
    const tenLocal = zonedWallTimeToUtc('2026-03-29', 10 * 60, TZ);
    expect(tenLocal.getUTCHours()).toBe(7);

    const input = baseInput({
      fromDateKey: '2026-03-29', // Sunday → closed in standardHours, so open it
      now: zonedWallTimeToUtc('2026-03-28', 6 * 60, TZ),
      openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        opensMin: 9 * 60,
        closesMin: 17 * 60,
        closed: false,
      })),
    });
    const [day] = computeAvailability(input);
    // Grid 09:00..16:00 for a 60-min service = 15 slots; the missing 03:00–04:00
    // hour is outside opening hours so slot count is unaffected.
    expect(day?.slots.length).toBe(15);
    // Every slot start is exactly 60 min after the previous on the wall clock.
    for (let i = 1; i < day!.slots.length; i++) {
      const prev = day!.slots[i - 1]!.startsAt.getTime();
      const cur = day!.slots[i]!.startsAt.getTime();
      expect(cur - prev).toBe(30 * 60_000);
    }
  });

  it('fall back: 2026-10-25, slot grid stays on the 30-min wall-clock step', () => {
    // The 03:00–04:00 local hour repeats; opening hours (09:00+) are unaffected.
    const input = baseInput({
      fromDateKey: '2026-10-25',
      now: zonedWallTimeToUtc('2026-10-24', 6 * 60, TZ),
      openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        opensMin: 9 * 60,
        closesMin: 17 * 60,
        closed: false,
      })),
    });
    const [day] = computeAvailability(input);
    expect(day?.slots.length).toBe(15);
    // First slot 09:00 local; after fall-back Cyprus is UTC+2 → 07:00Z.
    expect(day?.slots[0]?.startsAt.getUTCHours()).toBe(7);
    for (let i = 1; i < day!.slots.length; i++) {
      const prev = day!.slots[i - 1]!.startsAt.getTime();
      const cur = day!.slots[i]!.startsAt.getTime();
      expect(cur - prev).toBe(30 * 60_000);
    }
  });
});
describe('computeAvailability — staff days off (task 6.5)', () => {
  it('removes that staff member from every slot of their day off; "any" falls back to the other', () => {
    const [day] = computeAvailability(
      baseInput({ staff: [{ id: 'alice', daysOff: ['2026-06-10'] }, { id: 'bob' }] }),
    );
    expect(day!.slots.length).toBe(15);
    expect(day!.slots.every((s) => s.availableStaffIds.join() === 'bob')).toBe(true);
  });

  it('offers nothing for a specific staff member on their day off, and no slots when everyone is off', () => {
    const only = computeAvailability(baseInput({ staff: [{ id: 'alice', daysOff: ['2026-06-10'] }, { id: 'bob' }], staffId: 'alice' }));
    expect(only[0]!.slots).toEqual([]);
    const all = computeAvailability(baseInput({ staff: [{ id: 'alice', daysOff: ['2026-06-10'] }] }));
    expect(all[0]!.slots).toEqual([]);
  });

  it('only affects the listed dates', () => {
    const days = computeAvailability(baseInput({ days: 2, staff: [{ id: 'alice', daysOff: ['2026-06-10'] }] }));
    expect(days[0]!.slots).toEqual([]);
    expect(days[1]!.slots.length).toBeGreaterThan(0);
  });
});
