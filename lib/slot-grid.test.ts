import { describe, it, expect } from 'vitest';
import { buildDayGrid, dayWindows } from './slot-grid';
import { zonedWallTimeToUtc } from './time';

const base = { durationMin: 30, bufferMin: 0, stepMin: 30 };

describe('buildDayGrid', () => {
  it('covers the whole grid and flags only engine-available starts', () => {
    const day = '2026-06-10';
    const free = [10 * 60, 11 * 60].map((m) => zonedWallTimeToUtc(day, m));
    const grid = buildDayGrid({
      ...base,
      dateKey: day,
      windows: [{ opensMin: 9 * 60, closesMin: 12 * 60 }],
      available: free,
    });
    expect(grid).toHaveLength(6); // 09:00 .. 11:30
    expect(grid.filter((s) => s.available).map((s) => s.startsAt.toISOString())).toEqual(
      free.map((d) => d.toISOString()),
    );
  });

  it('respects duration + buffer at closing time and unions staff windows', () => {
    const day = '2026-06-10';
    const grid = buildDayGrid({
      ...base,
      bufferMin: 15,
      dateKey: day,
      windows: [
        { opensMin: 9 * 60, closesMin: 10 * 60 },
        { opensMin: 9 * 60 + 30, closesMin: 11 * 60 },
      ],
      available: [],
    });
    // 09:00, 09:30 (fits 10:00? 09:30+45=10:15 > 10:00 no for A, yes for B), 10:00, 10:15 not on step
    expect(grid.map((s) => s.startsAt.toISOString())).toEqual(
      [9 * 60, 9 * 60 + 30, 10 * 60].map((m) => zonedWallTimeToUtc(day, m).toISOString()),
    );
    expect(grid.every((s) => !s.available)).toBe(true);
  });

  it('is strictly ordered with unique instants on the spring-forward day (2026-03-29)', () => {
    const grid = buildDayGrid({
      ...base,
      durationMin: 60,
      stepMin: 60,
      dateKey: '2026-03-29',
      windows: [{ opensMin: 0, closesMin: 6 * 60 }],
      available: [],
    });
    const t = grid.map((s) => s.startsAt.getTime());
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(new Set(t).size).toBe(t.length);
    // 03:00 local does not exist, so at most 5 distinct instants for 6 wall hours.
    expect(grid.length).toBeLessThanOrEqual(5);
    // Real elapsed time between first (00:00) and last start is 4 h, not 5 h.
    expect((t[t.length - 1]! - t[0]!) / 3_600_000).toBe(4);
  });

  it('keeps all wall-clock starts on the fall-back day (2026-10-25)', () => {
    const grid = buildDayGrid({
      ...base,
      durationMin: 60,
      stepMin: 60,
      dateKey: '2026-10-25',
      windows: [{ opensMin: 0, closesMin: 6 * 60 }],
      available: [],
    });
    expect(grid).toHaveLength(6);
    // 00:00 local to 05:00 local spans 6 real hours (the 03:00-04:00 hour repeats).
    const t = grid.map((s) => s.startsAt.getTime());
    expect((t[5]! - t[0]!) / 3_600_000).toBe(6);
  });
});

describe('dayWindows', () => {
  // 2026-06-10 is a Wednesday (weekday 3).
  const hours = (weekday: number, closed = false) => ({ weekday, opensMin: 540, closesMin: 1020, closed });
  it('uses staff hours over business hours and skips closed days', () => {
    const w = dayWindows({
      dateKey: '2026-06-10',
      openingHours: [hours(3)],
      staffHours: [undefined, [{ weekday: 3, opensMin: 600, closesMin: 900, closed: false }], [hours(3, true)]],
      closures: [],
    });
    expect(w).toEqual([
      { opensMin: 540, closesMin: 1020 },
      { opensMin: 600, closesMin: 900 },
    ]);
  });
  it('returns no windows on a closure', () => {
    expect(
      dayWindows({
        dateKey: '2026-06-10',
        openingHours: [hours(3)],
        staffHours: [undefined],
        closures: [{ from: '2026-06-09', to: '2026-06-11' }],
      }),
    ).toEqual([]);
  });
});
