/**
 * URL state of the dashboard bookings table (task 6.3):
 * `?status=&from=&to=&staff=&q=&sort=&page=`. Pure. Each field is validated on its own and an
 * invalid value is dropped (falls back to the default), never thrown, so a bad shared link
 * still renders. Defaults are omitted from generated links to keep them short.
 */
import { isDateKey } from './calendar-params';

export const BOOKING_FILTERS = [
  'upcoming',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no-show',
  'all',
] as const;
export type BookingFilter = (typeof BOOKING_FILTERS)[number];

export const BOOKING_SORTS = ['date', 'created'] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

export const PAGE_SIZE = 20;
export const MAX_PAGE = 10_000;
export const MAX_QUERY_LENGTH = 80;

export interface BookingsParams {
  status: BookingFilter;
  /** Inclusive local (Europe/Nicosia) date keys, or null. */
  from: string | null;
  to: string | null;
  staffId: string | null;
  q: string;
  sort: BookingSort;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseBookingsParams(raw: Raw): BookingsParams {
  const status = one(raw.status);
  const sort = one(raw.sort);
  const from = one(raw.from);
  const to = one(raw.to);
  const staff = one(raw.staff);
  const page = Number(one(raw.page));
  const fromKey = isDateKey(from) ? from : null;
  let toKey = isDateKey(to) ? to : null;
  // An end before the start can never match anything: drop the end instead.
  if (fromKey && toKey && toKey < fromKey) toKey = null;
  return {
    status: BOOKING_FILTERS.includes(status as BookingFilter)
      ? (status as BookingFilter)
      : 'upcoming',
    from: fromKey,
    to: toKey,
    staffId: staff && staff.length <= 40 ? staff : null,
    q: (one(raw.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    sort: BOOKING_SORTS.includes(sort as BookingSort) ? (sort as BookingSort) : 'date',
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** True when anything other than the default view is applied (drives "Clear filters"). */
export function hasActiveFilters(p: BookingsParams): boolean {
  return (
    p.status !== 'upcoming' ||
    p.from !== null ||
    p.to !== null ||
    p.staffId !== null ||
    p.q !== ''
  );
}

/** Query string for a bookings URL; defaults omitted. */
export function bookingsQuery(p: Partial<BookingsParams>): string {
  const q = new URLSearchParams();
  if (p.status && p.status !== 'upcoming') q.set('status', p.status);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (p.staffId) q.set('staff', p.staffId);
  if (p.q) q.set('q', p.q);
  if (p.sort && p.sort !== 'date') q.set('sort', p.sort);
  if (p.page && p.page > 1) q.set('page', String(p.page));
  return q.toString();
}

/**
 * Text search terms: the trimmed text (name / reference) plus, when it holds at least 3
 * digits, a digits-only form so "99 123456" finds the stored "+35799123456". Reference
 * search is case-insensitive in the query, so "sc-ab12c" works.
 */
export function searchTerms(q: string): { text: string; digits: string | null } {
  const text = q.trim();
  const digits = text.replace(/\D/g, '');
  const onlyPhoneChars = /^[\d\s+()-]+$/.test(text);
  return { text, digits: onlyPhoneChars && digits.length >= 3 ? digits : null };
}

/**
 * Prisma passes `contains` straight into LIKE without escaping, so "%" or "_" typed by the
 * user would act as wildcards. Escape them (Postgres' default LIKE escape is backslash).
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
