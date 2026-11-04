import { describe, expect, it } from 'vitest';
import {
  bookingsQuery,
  escapeLike,
  hasActiveFilters,
  parseBookingsParams,
  searchTerms,
} from './bookings-params';
import { buildBookingsWhere } from './bookings-data';

describe('parseBookingsParams', () => {
  it('defaults to the upcoming view, page 1, date sort', () => {
    expect(parseBookingsParams({})).toEqual({
      status: 'upcoming',
      from: null,
      to: null,
      staffId: null,
      q: '',
      sort: 'date',
      page: 1,
    });
  });

  it('drops invalid values instead of throwing', () => {
    const p = parseBookingsParams({
      status: 'bogus',
      from: '2026-02-30',
      to: 'soon',
      sort: 'random',
      page: '-3',
      staff: 'x'.repeat(41),
    });
    expect(p).toMatchObject({
      status: 'upcoming',
      from: null,
      to: null,
      sort: 'date',
      page: 1,
      staffId: null,
    });
    expect(parseBookingsParams({ page: '2.5' }).page).toBe(1);
    expect(parseBookingsParams({ page: 'abc' }).page).toBe(1);
  });

  it('keeps valid values, trims and caps the search text, drops an end before the start', () => {
    const p = parseBookingsParams({
      status: 'no-show',
      from: '2026-07-10',
      to: '2026-07-01',
      q: `  ${'a'.repeat(100)}  `,
      page: '3',
      staff: 'abc',
    });
    expect(p.status).toBe('no-show');
    expect(p.from).toBe('2026-07-10');
    expect(p.to).toBeNull();
    expect(p.q).toHaveLength(80);
    expect(p.page).toBe(3);
    expect(p.staffId).toBe('abc');
  });

  it('round-trips through bookingsQuery and omits defaults', () => {
    expect(bookingsQuery(parseBookingsParams({}))).toBe('');
    const raw = { status: 'cancelled', from: '2026-07-01', q: 'anna', sort: 'created', page: '2' };
    const qs = bookingsQuery(parseBookingsParams(raw));
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual(raw);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the default view (page and sort do not count) and true otherwise', () => {
    expect(hasActiveFilters(parseBookingsParams({ page: '4', sort: 'created' }))).toBe(false);
    expect(hasActiveFilters(parseBookingsParams({ status: 'all' }))).toBe(true);
    expect(hasActiveFilters(parseBookingsParams({ q: 'x' }))).toBe(true);
  });
});

describe('searchTerms', () => {
  it('adds a digits-only form for phone-like input only', () => {
    expect(searchTerms(' 99 123456 ')).toEqual({ text: '99 123456', digits: '99123456' });
    expect(searchTerms('+357 99-123456').digits).toBe('35799123456');
    expect(searchTerms('SC-AB12C').digits).toBeNull();
    expect(searchTerms('Anna 2').digits).toBeNull();
    expect(searchTerms('12').digits).toBeNull();
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLike('anna')).toBe('anna');
  });
});

describe('buildBookingsWhere', () => {
  const now = new Date('2026-07-15T09:00:00Z');
  const base = parseBookingsParams({});

  it('always scopes to the business', () => {
    for (const status of ['upcoming', 'all', 'cancelled'] as const)
      expect(buildBookingsWhere('biz1', { ...base, status }, now).businessId).toBe('biz1');
  });

  it('upcoming = active statuses from now; cancelled covers both reasons', () => {
    expect(buildBookingsWhere('b', base, now)).toMatchObject({
      status: { in: ['PENDING', 'CONFIRMED'] },
      startsAt: { gte: now },
    });
    expect(buildBookingsWhere('b', { ...base, status: 'cancelled' }, now).status).toEqual({
      in: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_BUSINESS'],
    });
  });

  it('date range uses Europe/Nicosia midnights, end day inclusive', () => {
    const w = buildBookingsWhere(
      'b',
      { ...base, status: 'all', from: '2026-07-10', to: '2026-07-10' },
      now,
    );
    // Summer time: local midnight is 21:00Z the day before.
    expect(w.startsAt).toEqual({
      gte: new Date('2026-07-09T21:00:00Z'),
      lt: new Date('2026-07-10T21:00:00Z'),
    });
  });

  it('upcoming with a past "from" still starts at now', () => {
    const w = buildBookingsWhere('b', { ...base, from: '2026-01-01' }, now);
    expect(w.startsAt).toMatchObject({ gte: now });
  });

  it('text search ORs name, reference and (for phone-like input) phone', () => {
    const w = buildBookingsWhere('b', { ...base, q: '99 123' }, now);
    expect(w.OR).toHaveLength(3);
    expect(buildBookingsWhere('b', { ...base, q: 'anna' }, now).OR).toHaveLength(2);
    expect(buildBookingsWhere('b', base, now).OR).toBeUndefined();
  });
});
