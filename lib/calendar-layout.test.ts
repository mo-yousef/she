import { describe, expect, it } from 'vitest';
import type { OpeningHour } from './availability';
import {
  buildColumns,
  closedSegments,
  computeAxis,
  layoutDayEvents,
  minuteAtFraction,
  minutesFromLocalMidnight,
  openWindowFor,
} from './calendar-layout';
import { zonedWallTimeToUtc } from './time';

const at = (dateKey: string, min: number) => zonedWallTimeToUtc(dateKey, min);
const ev = (id: string, dateKey: string, from: number, to: number, staffId = 's1') => ({
  id,
  staffId,
  startsAt: at(dateKey, from),
  endsAt: at(dateKey, to),
});
const week = (
  opensMin: number,
  closesMin: number,
  closedDays: number[] = [],
): OpeningHour[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensMin,
    closesMin,
    closed: closedDays.includes(weekday),
  }));

describe('minutesFromLocalMidnight (wall clock, DST-safe)', () => {
  // Cyprus: 2026-03-29 is a 23-hour day, 2026-10-25 a 25-hour day.
  it.each(['2026-03-29', '2026-10-25', '2026-07-15'])(
    '10:00 local is minute 600 on %s',
    (day) => {
      expect(minutesFromLocalMidnight(at(day, 600), day)).toBe(600);
      expect(minutesFromLocalMidnight(at(day, 17 * 60 + 45), day)).toBe(1065);
    },
  );

  it('is not the elapsed time since midnight on the spring-forward day', () => {
    const start = at('2026-03-29', 600);
    const elapsed = (start.getTime() - at('2026-03-29', 0).getTime()) / 60_000;
    expect(elapsed).toBe(540); // fixed-24h arithmetic would put the booking an hour early
    expect(minutesFromLocalMidnight(start, '2026-03-29')).toBe(600);
  });

  it('is not the elapsed time since midnight on the fall-back day', () => {
    const start = at('2026-10-25', 600);
    const elapsed = (start.getTime() - at('2026-10-25', 0).getTime()) / 60_000;
    expect(elapsed).toBe(660); // 25-hour day: an hour late
    expect(minutesFromLocalMidnight(start, '2026-10-25')).toBe(600);
  });

  it('clips instants on other local days to the day edges', () => {
    expect(minutesFromLocalMidnight(at('2026-03-28', 600), '2026-03-29')).toBe(0);
    expect(minutesFromLocalMidnight(at('2026-03-30', 600), '2026-03-29')).toBe(1440);
    expect(minutesFromLocalMidnight(at('2026-03-30', 0), '2026-03-29')).toBe(1440);
  });
});

describe('layoutDayEvents', () => {
  const axis = { startMin: 540, endMin: 1080 };

  it('gives non-overlapping events their own full-width lane', () => {
    const placed = layoutDayEvents(
      [ev('a', '2026-03-29', 600, 660), ev('b', '2026-03-29', 660, 720)],
      '2026-03-29',
      axis,
    );
    expect(placed.map((p) => [p.item.id, p.startMin, p.endMin, p.lane, p.lanes])).toEqual(
      [
        ['a', 600, 660, 0, 1],
        ['b', 660, 720, 0, 1],
      ],
    );
  });

  it('puts overlapping events side by side', () => {
    const placed = layoutDayEvents(
      [ev('a', '2026-07-15', 600, 690), ev('b', '2026-07-15', 630, 720)],
      '2026-07-15',
      axis,
    );
    expect(placed.map((p) => [p.item.id, p.lane, p.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
  });

  it('clips to the axis and drops events outside it', () => {
    const placed = layoutDayEvents(
      [
        ev('early', '2026-07-15', 480, 560),
        ev('out', '2026-07-15', 300, 400),
        ev('late', '2026-07-15', 1060, 1140),
      ],
      '2026-07-15',
      axis,
    );
    expect(placed.map((p) => [p.item.id, p.startMin, p.endMin])).toEqual([
      ['early', 540, 560],
      ['late', 1060, 1080],
    ]);
  });

  it('places a DST-day booking by wall clock', () => {
    const [p] = layoutDayEvents([ev('a', '2026-03-29', 600, 660)], '2026-03-29', axis);
    expect([p!.startMin, p!.endMin]).toEqual([600, 660]);
  });
});

describe('computeAxis', () => {
  it('spans earliest opening to latest closing, in whole hours', () => {
    expect(
      computeAxis([
        { opensMin: 570, closesMin: 1065 },
        { opensMin: 600, closesMin: 1110 },
      ]),
    ).toEqual({
      startMin: 540,
      endMin: 1140,
    });
  });
  it('defaults to 08:00-20:00 with no open hours', () => {
    expect(computeAxis([])).toEqual({ startMin: 480, endMin: 1200 });
  });
  it('widens to include events outside opening hours', () => {
    expect(
      computeAxis(
        [{ opensMin: 540, closesMin: 1080 }],
        [
          { startMin: 450, endMin: 500 },
          { startMin: 1100, endMin: 1190 },
        ],
      ),
    ).toEqual({
      startMin: 420,
      endMin: 1200,
    });
  });
  it('is at least 4 hours tall', () => {
    expect(computeAxis([{ opensMin: 600, closesMin: 660 }])).toEqual({
      startMin: 600,
      endMin: 840,
    });
  });
});

describe('openWindowFor / closedSegments', () => {
  const bh = week(540, 1080, [0]); // Sunday closed
  it('returns the business window, or null on a closed weekday', () => {
    expect(openWindowFor('2026-07-15', bh, undefined, [])).toEqual({
      opensMin: 540,
      closesMin: 1080,
    }); // Wed
    expect(openWindowFor('2026-07-12', bh, undefined, [])).toBeNull(); // Sun
  });
  it('is closed during a closure', () => {
    expect(
      openWindowFor('2026-07-15', bh, undefined, [
        { from: '2026-07-14', to: '2026-07-16' },
      ]),
    ).toBeNull();
  });
  it('is closed on a staff day off (inclusive range), open the day after', () => {
    const off = [{ from: '2026-07-14', to: '2026-07-15' }];
    expect(openWindowFor('2026-07-15', bh, undefined, [], off)).toBeNull();
    expect(openWindowFor('2026-07-16', bh, undefined, [], off)).not.toBeNull();
  });
  it('staff hours replace business hours entirely', () => {
    expect(openWindowFor('2026-07-15', bh, week(600, 900), [])).toEqual({
      opensMin: 600,
      closesMin: 900,
    });
  });
  it('shades before opening, after closing, or the whole column', () => {
    const axis = { startMin: 480, endMin: 1140 };
    expect(closedSegments({ opensMin: 540, closesMin: 1080 }, axis)).toEqual([
      { startMin: 480, endMin: 540 },
      { startMin: 1080, endMin: 1140 },
    ]);
    expect(closedSegments(null, axis)).toEqual([{ startMin: 480, endMin: 1140 }]);
  });
});

describe('buildColumns', () => {
  const staff = [
    { id: 's1', name: 'Anna' },
    { id: 's2', name: 'Maria' },
  ];
  const base = { openingHours: week(540, 1080), closures: [], axisStaff: staff };

  it('day view: one column per staff member with their own events', () => {
    const { axis, columns } = buildColumns({
      ...base,
      view: 'day',
      dateKey: '2026-03-29',
      staff,
      events: [
        ev('a', '2026-03-29', 600, 660, 's1'),
        ev('b', '2026-03-29', 720, 780, 's2'),
      ],
    });
    expect(axis).toEqual({ startMin: 540, endMin: 1080 });
    expect(columns.map((c) => [c.key, c.events.map((e) => e.item.id)])).toEqual([
      ['s1', ['a']],
      ['s2', ['b']],
    ]);
  });

  it('week view: 7 day columns Monday-Sunday for one staff member', () => {
    const { columns } = buildColumns({
      ...base,
      view: 'week',
      dateKey: '2026-10-25', // a Sunday and the fall-back day
      staff: [staff[0]!],
      events: [
        ev('a', '2026-10-25', 600, 660),
        ev('b', '2026-10-22', 600, 660),
        ev('c', '2026-10-26', 600, 660, 's2'),
      ],
    });
    expect(columns.map((c) => c.dateKey)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(columns[3]!.events.map((e) => e.item.id)).toEqual(['b']);
    expect(columns[6]!.events.map((e) => [e.item.id, e.startMin])).toEqual([['a', 600]]);
  });
});

describe('minuteAtFraction', () => {
  const axis = { startMin: 540, endMin: 1080 };
  it('snaps to the grid and stays inside the axis', () => {
    expect(minuteAtFraction(0, axis, 30)).toBe(540);
    expect(minuteAtFraction(0.5, axis, 30)).toBe(810);
    expect(minuteAtFraction(1.5, axis, 30)).toBe(1050);
    expect(minuteAtFraction(-1, axis, 30)).toBe(540);
  });
});
