import { describe, expect, it } from 'vitest';
import {
  clampStaffHours,
  copyToAllDays as copyAll,
  countOutsideHours,
  formatTimeOfDay,
  isOpenNow,
  parseTimeOfDay,
  validateWeek,
  weekKey,
  type DayHours,
} from './hours';
import { zonedWallTimeToUtc } from './time';

const week = (over: Partial<DayHours> & { weekday?: number } = {}, at?: number): DayHours[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    closed: false,
    opensMin: 540,
    closesMin: 1080,
    ...(at === undefined || at === weekday ? over : {}),
  }));

describe('validateWeek', () => {
  it('accepts a normal week', () => {
    expect(validateWeek(week()).ok).toBe(true);
  });
  it('rejects close at or before open', () => {
    const r = validateWeek(week({ closesMin: 540 }, 2));
    expect(r).toEqual({ ok: false, errors: [{ weekday: 2, code: 'closeBeforeOpen' }] });
  });
  it('rejects minutes outside 0..1440', () => {
    const r = validateWeek(week({ closesMin: 1500 }, 3));
    expect(r).toEqual({ ok: false, errors: [{ weekday: 3, code: 'range' }] });
  });
  it('ignores times on closed days and normalises them', () => {
    const r = validateWeek(week({ closed: true, opensMin: 900, closesMin: 100 }, 0));
    expect(r.ok && r.days.find((d) => d.weekday === 0)).toEqual({ weekday: 0, closed: true, opensMin: 0, closesMin: 0 });
  });
  it('rejects a week with every day closed', () => {
    expect(validateWeek(week({ closed: true }))).toEqual({ ok: false, errors: [{ weekday: null, code: 'allClosed' }] });
  });
  it('requires exactly the 7 distinct weekdays', () => {
    expect(validateWeek(week().slice(1)).ok).toBe(false);
    const dup = week();
    dup[1]!.weekday = 0;
    expect(validateWeek(dup).ok).toBe(false);
  });
});

describe('time of day', () => {
  it('parses and formats HH:MM', () => {
    expect(parseTimeOfDay('09:30')).toBe(570);
    expect(parseTimeOfDay('24:00')).toBe(1440);
    expect(parseTimeOfDay('24:30')).toBeNull();
    expect(parseTimeOfDay('9:30')).toBeNull();
    expect(parseTimeOfDay('10:75')).toBeNull();
    expect(formatTimeOfDay(570)).toBe('09:30');
  });
});

// ---- task 6.6 ---------------------------------------------------------------------------
const wk = (over: Record<number, Partial<DayHours>> = {}): DayHours[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: false, opensMin: 540, closesMin: 1080, ...over[weekday] }));

describe('clampStaffHours', () => {
  it('leaves days that already fit untouched', () => {
    const staff = wk({ 1: { opensMin: 600, closesMin: 900 } });
    expect(clampStaffHours(staff, wk())).toEqual(staff);
  });
  it('intersects a narrowed business window', () => {
    const out = clampStaffHours(wk(), wk({ 3: { opensMin: 600, closesMin: 960 } }));
    expect(out.find((d) => d.weekday === 3)).toEqual({ weekday: 3, closed: false, opensMin: 600, closesMin: 960 });
    expect(out.find((d) => d.weekday === 2)).toEqual({ weekday: 2, closed: false, opensMin: 540, closesMin: 1080 });
  });
  it('closes the day when the business day is closed', () => {
    const out = clampStaffHours(wk(), wk({ 0: { closed: true, opensMin: 0, closesMin: 0 } }));
    expect(out.find((d) => d.weekday === 0)).toEqual({ weekday: 0, closed: true, opensMin: 0, closesMin: 0 });
  });
  it('closes the day when the intersection is empty', () => {
    const staff = wk({ 2: { opensMin: 540, closesMin: 600 } });
    const out = clampStaffHours(staff, wk({ 2: { opensMin: 720, closesMin: 1080 } }));
    expect(out.find((d) => d.weekday === 2)!.closed).toBe(true);
  });
  it('keeps closed staff days closed and does not widen', () => {
    const staff = wk({ 4: { closed: true, opensMin: 0, closesMin: 0 } });
    expect(clampStaffHours(staff, wk()).find((d) => d.weekday === 4)!.closed).toBe(true);
    expect(weekKey(clampStaffHours(wk({ 1: { opensMin: 600, closesMin: 700 } }), wk()))).toBe(weekKey(wk({ 1: { opensMin: 600, closesMin: 700 } })));
  });
});

describe('copyToAllDays (shared helper)', () => {
  it('copies the chosen row to every other day, including closed', () => {
    const days = wk({ 1: { closed: true, opensMin: 0, closesMin: 0 }, 2: { opensMin: 600, closesMin: 700 } });
    expect(copyAll(days, 2).every((d) => !d.closed && d.opensMin === 600 && d.closesMin === 700)).toBe(true);
    expect(copyAll(days, 1).every((d) => d.closed)).toBe(true);
  });
});

describe('isOpenNow', () => {
  // 2027-06-14 is a Monday. Summer: Nicosia is UTC+3.
  const monday = (min: number) => zonedWallTimeToUtc('2027-06-14', min);
  it('follows weekly hours, closing minute exclusive', () => {
    expect(isOpenNow(wk(), [], monday(540))).toBe(true);
    expect(isOpenNow(wk(), [], monday(539))).toBe(false);
    expect(isOpenNow(wk(), [], monday(1079))).toBe(true);
    expect(isOpenNow(wk(), [], monday(1080))).toBe(false);
  });
  it('is false on a closed weekday', () => {
    expect(isOpenNow(wk({ 1: { closed: true } }), [], monday(600))).toBe(false);
  });
  it('is false on a closure day (inclusive ends), true the day after', () => {
    const c = [{ from: '2027-06-13', to: '2027-06-14' }];
    expect(isOpenNow(wk(), c, monday(600))).toBe(false);
    expect(isOpenNow(wk(), [{ from: '2027-06-10', to: '2027-06-13' }], monday(600))).toBe(true);
  });
  it('uses the Nicosia date at the midnight boundary', () => {
    // 21:30 UTC on the 13th is 00:30 on Monday the 14th in Nicosia (UTC+3).
    const justAfterMidnight = new Date('2027-06-13T21:30:00Z');
    expect(isOpenNow(wk({ 1: { opensMin: 0, closesMin: 1440 } }), [], justAfterMidnight)).toBe(true);
    expect(isOpenNow(wk({ 1: { opensMin: 0, closesMin: 1440 } }), [{ from: '2027-06-14', to: '2027-06-14' }], justAfterMidnight)).toBe(false);
    // A closure on the previous local day does not close Monday.
    expect(isOpenNow(wk({ 1: { opensMin: 0, closesMin: 1440 } }), [{ from: '2027-06-13', to: '2027-06-13' }], justAfterMidnight)).toBe(true);
  });
  it('handles the DST day (2027-03-28, clocks go 03:00 -> 04:00 in Nicosia)', () => {
    // Sunday. 10:00 local is 07:00 UTC (already UTC+3).
    const sunday = (min: number) => zonedWallTimeToUtc('2027-03-28', min);
    expect(isOpenNow(wk(), [], sunday(600))).toBe(true);
    expect(isOpenNow(wk(), [{ from: '2027-03-28', to: '2027-03-28' }], sunday(600))).toBe(false);
    expect(isOpenNow(wk(), [], sunday(480))).toBe(false);
  });
});

describe('countOutsideHours', () => {
  const at = (key: string, startMin: number, durMin: number) => {
    const startsAt = zonedWallTimeToUtc(key, startMin);
    return { startsAt, endsAt: new Date(startsAt.getTime() + durMin * 60_000) };
  };
  it('counts closed days, early starts and late ends only', () => {
    const week = wk({ 1: { opensMin: 600, closesMin: 900 }, 2: { closed: true, opensMin: 0, closesMin: 0 } });
    const bookings = [
      at('2027-06-14', 600, 60), // Mon 10:00-11:00 fits
      at('2027-06-14', 540, 60), // starts before opening
      at('2027-06-14', 870, 60), // ends 15:30, after close
      at('2027-06-15', 600, 60), // Tue closed
    ];
    expect(countOutsideHours(bookings, week)).toBe(3);
  });
  it('is correct on a DST date and for a booking ending at local midnight', () => {
    // Sunday 2027-03-28: 02:00 local is before the 03:00 jump; a 60-minute booking at 10:00 is plain.
    expect(countOutsideHours([at('2027-03-28', 600, 60)], wk())).toBe(0);
    expect(countOutsideHours([at('2027-03-28', 600, 60)], wk({ 0: { opensMin: 660 } }))).toBe(1);
    const late = at('2027-06-14', 1380, 60); // 23:00 -> 24:00
    expect(countOutsideHours([late], wk({ 1: { opensMin: 0, closesMin: 1440 } }))).toBe(0);
    expect(countOutsideHours([late], wk({ 1: { opensMin: 0, closesMin: 1430 } }))).toBe(1);
  });
});
