import { describe, expect, it } from 'vitest';
import { PUBLIC_REVIEW_STATUSES, isPublicReviewStatus } from './review-visibility';
import { REPORT_REASONS, reportReviewSchema } from './review-report';
import { REVIEWS_PAGE_SIZE, clampPage, parseReviewsParams, reviewsHref } from './reviews-params';
import { businessSettingsSchema, parseSettings } from './settings';
import { changedSettingKeys, mergeSettings, parseSettingsForm } from './settings-schema';

const valid = { autoConfirm: true, slotIntervalMin: 30, bufferMin: 10, minLeadMin: 60, maxAdvanceDays: 60, cancellationWindowHours: 24, maxPerCustomerPerDay: 3 };

describe('settings form schema', () => {
  it('accepts valid input and everything it accepts also parses in the read schema', () => {
    const r = parseSettingsForm(valid);
    expect(r.ok).toBe(true);
    expect(businessSettingsSchema.safeParse(valid).success).toBe(true);
  });
  it('reports one error code per bad field', () => {
    const r = parseSettingsForm({ ...valid, bufferMin: 7, minLeadMin: 1500, maxAdvanceDays: 0, cancellationWindowHours: 169, maxPerCustomerPerDay: 11, slotIntervalMin: 45 });
    expect(r).toEqual({
      ok: false,
      errors: { bufferMin: 'step', minLeadMin: 'range', maxAdvanceDays: 'range', cancellationWindowHours: 'range', maxPerCustomerPerDay: 'range', slotIntervalMin: 'choice' },
    });
  });
  it('flags missing, non-integer and non-numeric values', () => {
    const r = parseSettingsForm({ ...valid, bufferMin: undefined, minLeadMin: 1.5, maxAdvanceDays: '5' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['bufferMin', 'maxAdvanceDays', 'minLeadMin']);
  });
  it('merge keeps unknown keys and reports only changed field names', () => {
    const f = parseSettingsForm({ ...valid, autoConfirm: false, maxAdvanceDays: 90 });
    if (!f.ok) throw new Error('invalid');
    expect(mergeSettings({ legacy: 'x', maxAdvanceDays: 60 }, f.data)).toMatchObject({ legacy: 'x', autoConfirm: false, maxAdvanceDays: 90 });
    expect(mergeSettings(null, f.data)).toMatchObject({ autoConfirm: false });
    expect(changedSettingKeys(parseSettings({ ...valid }), f.data).sort()).toEqual(['autoConfirm', 'maxAdvanceDays']);
  });
});

describe('review visibility', () => {
  it('VISIBLE and FLAGGED are public; HIDDEN is not', () => {
    expect([...PUBLIC_REVIEW_STATUSES]).toEqual(['VISIBLE', 'FLAGGED']);
    expect(isPublicReviewStatus('FLAGGED')).toBe(true);
    expect(isPublicReviewStatus('HIDDEN')).toBe(false);
  });
});

describe('report schema', () => {
  it('accepts only the fixed reasons', () => {
    for (const reason of REPORT_REASONS) expect(reportReviewSchema.safeParse({ reviewId: 'r1', reason }).success).toBe(true);
    expect(reportReviewSchema.safeParse({ reviewId: 'r1', reason: 'I dislike it' }).success).toBe(false);
    expect(reportReviewSchema.safeParse({ reviewId: '', reason: 'spam' }).success).toBe(false);
  });
});

describe('reviews params', () => {
  it('drops invalid values', () => {
    expect(parseReviewsParams({ filter: 'bogus', page: '-3' })).toEqual({ filter: 'all', page: 1 });
    expect(parseReviewsParams({ filter: ['reported'], page: '2' })).toEqual({ filter: 'reported', page: 2 });
    expect(parseReviewsParams({ page: '99999' }).page).toBe(10_000);
  });
  it('clamps the page and builds short links', () => {
    expect(clampPage(5, REVIEWS_PAGE_SIZE * 2)).toEqual({ page: 2, pageCount: 2 });
    expect(clampPage(3, 0)).toEqual({ page: 1, pageCount: 1 });
    expect(reviewsHref({ filter: 'all', page: 1 })).toBe('/dashboard/reviews');
    expect(reviewsHref({ filter: 'replied', page: 2 })).toBe('/dashboard/reviews?filter=replied&page=2');
  });
});
