/**
 * URL state of the dashboard reviews list (task 6.8): `?filter=&page=`. Pure; an invalid value
 * is dropped (falls back to the default), never thrown, so a bad shared link still renders.
 */
export const REVIEW_FILTERS = ['all', 'needsReply', 'replied', 'reported'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];
export const REVIEWS_PAGE_SIZE = 20;
export const MAX_REVIEWS_PAGE = 10_000;

export interface ReviewsParams {
  filter: ReviewFilter;
  page: number;
}
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseReviewsParams(raw: Raw): ReviewsParams {
  const f = one(raw.filter);
  const filter = (REVIEW_FILTERS as readonly string[]).includes(f ?? '') ? (f as ReviewFilter) : 'all';
  const p = one(raw.page);
  const n = p && /^\d{1,5}$/.test(p) ? Number(p) : 1;
  return { filter, page: Math.min(Math.max(n, 1), MAX_REVIEWS_PAGE) };
}

/** Page number clamped to the real page count (a stale link past the end shows the last page). */
export function clampPage(page: number, total: number): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  return { page: Math.min(Math.max(page, 1), pageCount), pageCount };
}

export function reviewsHref(p: Partial<ReviewsParams>): string {
  const qs = new URLSearchParams();
  if (p.filter && p.filter !== 'all') qs.set('filter', p.filter);
  if (p.page && p.page > 1) qs.set('page', String(p.page));
  const s = qs.toString();
  return s ? `/dashboard/reviews?${s}` : '/dashboard/reviews';
}
