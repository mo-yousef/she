import { describe, expect, it } from 'vitest';
import { expandBlockOccurrences, MAX_OCCURRENCES } from './block-expansion';
import { localDateKey, minutesOfDayInZone } from './time';

const ok = (r: ReturnType<typeof expandBlockOccurrences>) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.occurrences;
};

describe('expandBlockOccurrences', () => {
  it('creates a single block when not recurring', () => {
    const occ = ok(
      expandBlockOccurrences({
        dateKey: '2026-07-15',
        startMin: 780,
        endMin: 840,
        recurrence: 'none',
      }),
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]!.dateKey).toBe('2026-07-15');
  });

  it('expands daily and weekly series including the until date', () => {
    const daily = ok(
      expandBlockOccurrences({
        dateKey: '2026-07-15',
        startMin: 600,
        endMin: 660,
        recurrence: 'daily',
        untilKey: '2026-07-19',
      }),
    );
    expect(daily.map((o) => o.dateKey)).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
    const weekly = ok(
      expandBlockOccurrences({
        dateKey: '2026-07-15',
        startMin: 600,
        endMin: 660,
        recurrence: 'weekly',
        untilKey: '2026-08-05',
      }),
    );
    expect(weekly.map((o) => o.dateKey)).toEqual([
      '2026-07-15',
      '2026-07-22',
      '2026-07-29',
      '2026-08-05',
    ]);
  });

  it('keeps the same LOCAL time across the spring DST change (2026-03-29)', () => {
    const occ = ok(
      expandBlockOccurrences({
        dateKey: '2026-03-23',
        startMin: 780,
        endMin: 840,
        recurrence: 'weekly',
        untilKey: '2026-04-06',
      }),
    );
    expect(occ.map((o) => o.dateKey)).toEqual(['2026-03-23', '2026-03-30', '2026-04-06']);
    for (const o of occ) {
      expect(minutesOfDayInZone(o.startsAt)).toBe(780);
      expect(minutesOfDayInZone(o.endsAt)).toBe(840);
      expect(localDateKey(o.startsAt)).toBe(o.dateKey);
    }
    // UTC shifts by an hour (+02:00 winter, +03:00 summer) — it is NOT +7*24h.
    expect(occ[0]!.startsAt.toISOString()).toBe('2026-03-23T11:00:00.000Z');
    expect(occ[1]!.startsAt.toISOString()).toBe('2026-03-30T10:00:00.000Z');
  });

  it('keeps the same LOCAL time across the autumn DST change (2026-10-25)', () => {
    const occ = ok(
      expandBlockOccurrences({
        dateKey: '2026-10-22',
        startMin: 780,
        endMin: 840,
        recurrence: 'weekly',
        untilKey: '2026-11-05',
      }),
    );
    for (const o of occ) expect(minutesOfDayInZone(o.startsAt)).toBe(780);
    expect(occ[0]!.startsAt.toISOString()).toBe('2026-10-22T10:00:00.000Z');
    expect(occ[1]!.startsAt.toISOString()).toBe('2026-10-29T11:00:00.000Z');
  });

  it('daily series across a DST change also keeps local time', () => {
    const occ = ok(
      expandBlockOccurrences({
        dateKey: '2026-03-28',
        startMin: 600,
        endMin: 660,
        recurrence: 'daily',
        untilKey: '2026-03-30',
      }),
    );
    expect(occ.map((o) => minutesOfDayInZone(o.startsAt))).toEqual([600, 600, 600]);
  });

  it('enforces the caps', () => {
    const base = { dateKey: '2026-07-15', startMin: 600, endMin: 660 };
    expect(
      expandBlockOccurrences({ ...base, recurrence: 'daily', untilKey: '2026-10-20' }),
    ).toEqual({ ok: false, code: 'untilTooFar' });
    // 90 days of daily blocks is 91 rows, over the 60-occurrence cap.
    const r = expandBlockOccurrences({
      ...base,
      recurrence: 'daily',
      untilKey: '2026-10-13',
    });
    expect(r).toEqual({ ok: false, code: 'tooManyOccurrences' });
    // Weekly for the whole 90 days is fine (13 rows).
    expect(
      ok(
        expandBlockOccurrences({ ...base, recurrence: 'weekly', untilKey: '2026-10-13' }),
      ),
    ).toHaveLength(13);
    expect(MAX_OCCURRENCES).toBe(60);
  });

  it('validates the inputs', () => {
    const base = { dateKey: '2026-07-15', startMin: 600, endMin: 660 };
    expect(expandBlockOccurrences({ ...base, recurrence: 'weekly' })).toEqual({
      ok: false,
      code: 'untilRequired',
    });
    expect(
      expandBlockOccurrences({ ...base, recurrence: 'weekly', untilKey: '2026-07-14' }),
    ).toEqual({ ok: false, code: 'untilBeforeStart' });
    expect(expandBlockOccurrences({ ...base, endMin: 600, recurrence: 'none' })).toEqual({
      ok: false,
      code: 'invalidTimes',
    });
    expect(expandBlockOccurrences({ ...base, endMin: 1500, recurrence: 'none' })).toEqual(
      { ok: false, code: 'invalidTimes' },
    );
  });
});
