import { describe, expect, it } from 'vitest';
import type { DayHours } from './hours';
import { moveWithinCategory } from './services-schema';
import {
  DEFAULT_ROLE,
  checkDayOffRange,
  checkStaffHours,
  copyToAllDays,
  dayOffInputSchema,
  outsideBusinessWeekdays,
  staffFieldErrors,
  staffInputSchema,
} from './team-schema';

const week = (over: Partial<DayHours> = {}, only?: number): DayHours[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: false, opensMin: 540, closesMin: 1080, ...(only === undefined || only === weekday ? over : {}) }));
const valid = { name: 'Maria K', role: 'Colourist', active: true, serviceIds: ['a', 'a', 'b'], hours: null };
const errorsOf = (over: Record<string, unknown>) => {
  const r = staffInputSchema.safeParse({ ...valid, ...over });
  return r.success ? {} : staffFieldErrors(r.error);
};

describe('staffInputSchema', () => {
  it('accepts a valid member, de-duplicates services, defaults an empty role', () => {
    const r = staffInputSchema.parse({ ...valid, role: '   ' });
    expect(r.serviceIds).toEqual(['a', 'b']);
    expect(r.role).toBe(DEFAULT_ROLE);
  });
  it('bounds name (2..60) and role (<=60)', () => {
    expect(errorsOf({ name: 'A' }).name).toBe('nameRequired');
    expect(errorsOf({ name: 'x'.repeat(61) }).name).toBe('nameRequired');
    expect(errorsOf({ name: 'x'.repeat(60) }).name).toBeUndefined();
    expect(errorsOf({ role: 'x'.repeat(61) }).role).toBe('roleTooLong');
  });
});

describe('checkStaffHours', () => {
  const business = week();
  it('null inherits', () => {
    expect(checkStaffHours(null, business)).toEqual({ ok: true, days: null });
  });
  it('accepts a narrower window and closed days', () => {
    const r = checkStaffHours(week({ opensMin: 600, closesMin: 960 }), business);
    expect(r.ok).toBe(true);
    expect(checkStaffHours(week({ closed: true }, 2).map((d, i) => (i === 0 ? { ...d } : d)), business).ok).toBe(true);
  });
  it('rejects a partial week', () => {
    const r = checkStaffHours(week().slice(0, 5), business);
    expect(r).toMatchObject({ ok: false, errors: { hours: 'weekdays' } });
  });
  it('rejects close before open and an all-closed week', () => {
    const r = checkStaffHours(week({ opensMin: 700, closesMin: 600 }, 3), business);
    expect(r).toMatchObject({ ok: false, errors: { 'hours.3': 'closeBeforeOpen' } });
    expect(checkStaffHours(week({ closed: true }), business)).toMatchObject({ ok: false, errors: { hours: 'allClosed' } });
  });
  it('rejects windows outside the business window, per weekday', () => {
    const r = checkStaffHours(week({ opensMin: 480 }, 1), business);
    expect(r).toMatchObject({ ok: false, errors: { hours: 'outsideBusinessHours', 'hours.1': 'outsideBusinessHours' } });
    expect(checkStaffHours(week({ closesMin: 1100 }, 5), business)).toMatchObject({ ok: false });
  });
  it('a day the business is closed cannot be open for staff', () => {
    const biz = week({ closed: true }, 0);
    expect(outsideBusinessWeekdays(week(), biz)).toEqual([0]);
    expect(outsideBusinessWeekdays(week({ closed: true }, 0), biz)).toEqual([]);
    expect(outsideBusinessWeekdays(week(), [])).toHaveLength(7);
  });
});

describe('copyToAllDays', () => {
  it('copies a day onto every other day', () => {
    const days = week().map((d) => (d.weekday === 1 ? { ...d, opensMin: 600, closesMin: 900 } : d));
    const out = copyToAllDays(days, 1);
    expect(out.every((d) => d.opensMin === 600 && d.closesMin === 900 && !d.closed)).toBe(true);
  });
});

describe('day-off range', () => {
  const ok = (v: Record<string, unknown>) => dayOffInputSchema.safeParse(v);
  it('validates date keys and trims the reason', () => {
    expect(ok({ fromDate: '2026-02-30', toDate: '2026-03-01' }).success).toBe(false);
    expect(ok({ fromDate: '2026-05-01', toDate: '2026-05-02', reason: '  trip ' })).toMatchObject({ success: true, data: { reason: 'trip' } });
    expect(ok({ fromDate: '2026-05-01', toDate: '2026-05-02', reason: 'x'.repeat(121) }).success).toBe(false);
  });
  it('enforces to >= from, not entirely past, and a one-year cap', () => {
    expect(checkDayOffRange({ fromDate: '2026-05-05', toDate: '2026-05-04' }, '2026-05-01')).toEqual({ toDate: 'toBeforeFrom' });
    expect(checkDayOffRange({ fromDate: '2026-04-01', toDate: '2026-04-30' }, '2026-05-01')).toEqual({ toDate: 'inPast' });
    expect(checkDayOffRange({ fromDate: '2026-04-28', toDate: '2026-05-02' }, '2026-05-01')).toBeNull();
    expect(checkDayOffRange({ fromDate: '2026-05-01', toDate: '2027-04-30' }, '2026-05-01')).toBeNull(); // 365 days
    expect(checkDayOffRange({ fromDate: '2026-05-01', toDate: '2027-05-02' }, '2026-05-01')).toEqual({ toDate: 'tooLong' });
  });
});

describe('moving team members (flat list)', () => {
  const flat = ['a', 'b', 'c'].map((id) => ({ id, category: '' }));
  it('swaps with the neighbour and stops at the ends', () => {
    expect(moveWithinCategory(flat, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveWithinCategory(flat, 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(moveWithinCategory(flat, 'a', 'up')).toBeNull();
    expect(moveWithinCategory(flat, 'c', 'down')).toBeNull();
  });
});
