import { describe, expect, it } from 'vitest';
import { checkBusinessHours, checkClosureRange, closureInputSchema, MAX_CLOSURE_SPAN_DAYS } from './hours-schema';
import { addDaysToKey } from './time';

const days = (over: Record<number, Record<string, unknown>> = {}) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: false, opensMin: 540, closesMin: 1080, ...over[weekday] }));

describe('checkBusinessHours', () => {
  it('accepts a valid week and normalises closed rows', () => {
    const r = checkBusinessHours({ days: days({ 0: { closed: true, opensMin: 5, closesMin: 9 } }) });
    expect(r.ok && r.days.find((d) => d.weekday === 0)).toEqual({ weekday: 0, closed: true, opensMin: 0, closesMin: 0 });
  });
  it('rejects close <= open and out-of-range minutes per day', () => {
    const r = checkBusinessHours({ days: days({ 2: { opensMin: 600, closesMin: 600 }, 3: { closesMin: 1500 } }) });
    expect(r).toMatchObject({ ok: false, errors: { 'day-2': 'closeBeforeOpen', 'day-3': 'range' } });
  });
  it('rejects missing or duplicated weekdays and NaN times', () => {
    expect(checkBusinessHours({ days: days().slice(0, 6) })).toMatchObject({ ok: false, errors: { form: 'weekdays' } });
    expect(checkBusinessHours({ days: days({ 4: { opensMin: Number.NaN } }) })).toMatchObject({ ok: false, errors: { 'day-4': 'range' } });
    expect(checkBusinessHours(null)).toMatchObject({ ok: false });
  });
  it('allows an all-closed week but flags it', () => {
    const all = days();
    for (const d of all) d.closed = true;
    expect(checkBusinessHours({ days: all })).toMatchObject({ ok: true, noOpenDays: true });
  });
});

describe('closure range', () => {
  const today = '2027-06-14';
  it('requires valid dates', () => {
    expect(closureInputSchema.safeParse({ fromDate: '2027-13-01', toDate: '2027-06-20' }).success).toBe(false);
  });
  it('rejects to before from, entirely past, and spans over a year', () => {
    expect(checkClosureRange({ fromDate: '2027-06-20', toDate: '2027-06-19' }, today)).toEqual({ toDate: 'toBeforeFrom' });
    expect(checkClosureRange({ fromDate: '2027-06-01', toDate: '2027-06-13' }, today)).toEqual({ toDate: 'inPast' });
    expect(checkClosureRange({ fromDate: today, toDate: addDaysToKey(today, MAX_CLOSURE_SPAN_DAYS) }, today)).toEqual({ toDate: 'tooLong' });
  });
  it('accepts ongoing, single-day and 366-day ranges; caps the reason', () => {
    expect(checkClosureRange({ fromDate: '2027-06-10', toDate: today }, today)).toBeNull();
    expect(checkClosureRange({ fromDate: today, toDate: today }, today)).toBeNull();
    expect(checkClosureRange({ fromDate: today, toDate: addDaysToKey(today, MAX_CLOSURE_SPAN_DAYS - 1) }, today)).toBeNull();
    expect(closureInputSchema.safeParse({ fromDate: today, toDate: today, reason: 'x'.repeat(121) }).success).toBe(false);
  });
});
