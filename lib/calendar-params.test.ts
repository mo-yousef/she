import { describe, expect, it } from 'vitest';
import {
  calendarQuery,
  isDateKey,
  parseCalendarParams,
  shiftDateKey,
  visibleDateKeys,
  weekStartKey,
} from './calendar-params';

const TODAY = '2026-07-15';

describe('isDateKey', () => {
  it('accepts real dates only', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-2-3')).toBe(false);
    expect(isDateKey('tomorrow')).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe('parseCalendarParams', () => {
  it('defaults to day view, today, all staff', () => {
    expect(parseCalendarParams({}, TODAY)).toEqual({
      view: 'day',
      dateKey: TODAY,
      staffId: null,
      showCancelled: false,
    });
  });
  it('reads valid values', () => {
    expect(
      parseCalendarParams(
        { view: 'week', date: '2026-03-29', staff: 'abc', cancelled: '1' },
        TODAY,
      ),
    ).toEqual({
      view: 'week',
      dateKey: '2026-03-29',
      staffId: 'abc',
      showCancelled: true,
    });
  });
  it('drops invalid values instead of throwing', () => {
    const p = parseCalendarParams(
      { view: 'month', date: '2026-13-45', staff: 'all', cancelled: 'yes' },
      TODAY,
    );
    expect(p).toEqual({
      view: 'day',
      dateKey: TODAY,
      staffId: null,
      showCancelled: false,
    });
    expect(parseCalendarParams({ date: ['2026-07-20', 'x'] }, TODAY).dateKey).toBe(
      '2026-07-20',
    );
  });
});

describe('week helpers', () => {
  it('week starts on Monday', () => {
    expect(weekStartKey('2026-07-15')).toBe('2026-07-13'); // Wednesday
    expect(weekStartKey('2026-07-13')).toBe('2026-07-13'); // Monday
    expect(weekStartKey('2026-03-29')).toBe('2026-03-23'); // Sunday (DST day)
    expect(weekStartKey('2026-10-25')).toBe('2026-10-19'); // Sunday (DST day)
  });
  it('lists the visible days and pages by 1 or 7 days', () => {
    expect(visibleDateKeys('day', TODAY)).toEqual([TODAY]);
    expect(visibleDateKeys('week', '2026-03-29')).toHaveLength(7);
    expect(visibleDateKeys('week', '2026-03-29')[6]).toBe('2026-03-29');
    expect(shiftDateKey('day', '2026-03-31', 1)).toBe('2026-04-01');
    expect(shiftDateKey('week', '2026-03-29', -1)).toBe('2026-03-22');
  });
  it('builds short query strings', () => {
    expect(calendarQuery({ dateKey: TODAY })).toBe('date=2026-07-15');
    expect(
      calendarQuery({ view: 'week', dateKey: TODAY, staffId: 's1', showCancelled: true }),
    ).toBe('view=week&date=2026-07-15&staff=s1&cancelled=1');
  });
});
