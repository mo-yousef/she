/** Pure admin vocabulary: transition tables and URL params (task 7.1). Safe for client code. */
import type { BusinessStatus, ReviewStatus } from '@prisma/client';
export const ADMIN_PAGE_SIZE = 20;
export const MAX_ADMIN_PAGE = 10_000;
export const BUSINESS_ACTIONS = ['approve', 'reject', 'suspend', 'unsuspend'] as const;
export type BusinessAction = (typeof BUSINESS_ACTIONS)[number];
/**
 * approve PENDING->PUBLISHED; reject PENDING->DRAFT; suspend PUBLISHED|PENDING->SUSPENDED;
 * unsuspend SUSPENDED->DRAFT (the owner must resubmit, so a suspended listing never goes live unreviewed).
 */
export const BUSINESS_TRANSITIONS: Record<BusinessAction, { from: readonly BusinessStatus[]; to: BusinessStatus }> = {
  approve: { from: ['PENDING'], to: 'PUBLISHED' },
  reject: { from: ['PENDING'], to: 'DRAFT' },
  suspend: { from: ['PUBLISHED', 'PENDING'], to: 'SUSPENDED' },
  unsuspend: { from: ['SUSPENDED'], to: 'DRAFT' },
};
export const REVIEW_ACTIONS = ['keep', 'hide', 'restore'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const REVIEW_TRANSITIONS: Record<ReviewAction, { from: readonly ReviewStatus[]; to: ReviewStatus }> = {
  keep: { from: ['FLAGGED'], to: 'VISIBLE' },
  hide: { from: ['VISIBLE', 'FLAGGED'], to: 'HIDDEN' },
  restore: { from: ['HIDDEN'], to: 'VISIBLE' },
};
/** Actions available for a current status (drives which buttons render). */
export function businessActionsFor(status: BusinessStatus): BusinessAction[] {
  return BUSINESS_ACTIONS.filter((a) => BUSINESS_TRANSITIONS[a].from.includes(status));
}
export function reviewActionsFor(status: ReviewStatus): ReviewAction[] {
  return REVIEW_ACTIONS.filter((a) => REVIEW_TRANSITIONS[a].from.includes(status));
}
export const BUSINESS_FILTERS = ['PENDING', 'PUBLISHED', 'SUSPENDED', 'DRAFT', 'all'] as const;
export type BusinessFilter = (typeof BUSINESS_FILTERS)[number];
export const REVIEW_FILTERS = ['flagged', 'hidden', 'all'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
function pageOf(raw: Raw): number {
  const p = one(raw.page);
  const n = p && /^\d{1,5}$/.test(p) ? Number(p) : 1;
  return Math.min(Math.max(n, 1), MAX_ADMIN_PAGE);
}
function qOf(raw: Raw): string {
  return (one(raw.q) ?? '').trim().slice(0, 80);
}
function pick<T extends string>(values: readonly T[], v: string | undefined, fallback: T): T {
  return (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
}
export function parseAdminBusinessParams(raw: Raw) {
  return { status: pick(BUSINESS_FILTERS, one(raw.status), 'PENDING'), q: qOf(raw), page: pageOf(raw) };
}
export function parseAdminReviewParams(raw: Raw) {
  return { filter: pick(REVIEW_FILTERS, one(raw.filter), 'flagged'), page: pageOf(raw) };
}
export function parseAdminUserParams(raw: Raw) {
  return { q: qOf(raw), page: pageOf(raw) };
}
