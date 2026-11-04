import { describe, expect, it } from 'vitest';
import { computeRatingAggregate } from './reviews';
import {
  REVIEW_WINDOW_DAYS,
  authorDisplayName,
  canReplyToReview,
  isWithinReviewWindow,
  ownerReplySchema,
  submitReviewSchema,
  verifyOtpSchema,
} from './review-schema';

const base = { businessSlug: 'x', reference: 'SC-ABCDE', token: 't' };

describe('submitReviewSchema', () => {
  it('accepts rating 1..5 and trims/empties the body', () => {
    expect(submitReviewSchema.parse({ ...base, rating: 5, body: '  Great  ' }).body).toBe('Great');
    expect(submitReviewSchema.parse({ ...base, rating: '3', body: '   ' }).body).toBeUndefined();
    expect(submitReviewSchema.parse({ ...base, rating: 1 }).body).toBeUndefined();
  });
  it('rejects bad ratings and an over-long body', () => {
    for (const rating of [0, 6, 2.5, -1, 'x']) {
      expect(submitReviewSchema.safeParse({ ...base, rating }).success).toBe(false);
    }
    expect(submitReviewSchema.safeParse({ ...base, rating: 4, body: 'a'.repeat(2001) }).success).toBe(false);
    expect(submitReviewSchema.safeParse({ ...base, rating: 4, body: 'a'.repeat(2000) }).success).toBe(true);
  });
  it('rejects a malformed reference', () => {
    expect(submitReviewSchema.safeParse({ ...base, reference: 'sc-1', rating: 4 }).success).toBe(false);
  });
});

describe('verifyOtpSchema', () => {
  it('needs exactly 6 digits', () => {
    expect(verifyOtpSchema.safeParse({ ...base, code: '123456' }).success).toBe(true);
    for (const code of ['12345', '1234567', 'abcdef', '12 456']) {
      expect(verifyOtpSchema.safeParse({ ...base, code }).success).toBe(false);
    }
  });
});

describe('ownerReplySchema', () => {
  it('trims, requires 1..1000 chars', () => {
    expect(ownerReplySchema.parse({ reviewId: 'r', body: '  Thanks!  ' }).body).toBe('Thanks!');
    expect(ownerReplySchema.safeParse({ reviewId: 'r', body: '   ' }).success).toBe(false);
    expect(ownerReplySchema.safeParse({ reviewId: 'r', body: 'a'.repeat(1000) }).success).toBe(true);
    expect(ownerReplySchema.safeParse({ reviewId: 'r', body: 'a'.repeat(1001) }).success).toBe(false);
  });
});

describe('review window', () => {
  const end = new Date('2026-11-01T10:00:00Z');
  it('accepts up to the window and rejects after', () => {
    const edge = new Date(end.getTime() + REVIEW_WINDOW_DAYS * 86_400_000);
    expect(isWithinReviewWindow(end, edge)).toBe(true);
    expect(isWithinReviewWindow(end, new Date(edge.getTime() + 1))).toBe(false);
  });
});

describe('authorDisplayName', () => {
  it('first name + initial', () => {
    expect(authorDisplayName('Maria Ioannou', 'Customer')).toBe('Maria I.');
    expect(authorDisplayName('  anna   maria  papadopoulou ', 'Customer')).toBe('anna M.');
    expect(authorDisplayName('Σοφία Παπαδοπούλου', 'Πελάτης')).toBe('Σοφία Π.');
  });
  it('single name, empty and null', () => {
    expect(authorDisplayName('Maria', 'Customer')).toBe('Maria');
    expect(authorDisplayName('   ', 'Customer')).toBe('Customer');
    expect(authorDisplayName(null, 'Customer')).toBe('Customer');
  });
});

describe('canReplyToReview', () => {
  const biz = { ownerId: 'u1' };
  it('owner of the business only', () => {
    expect(canReplyToReview({ role: 'OWNER', id: 'u1' }, biz)).toBe(true);
    expect(canReplyToReview({ role: 'OWNER', id: 'u2' }, biz)).toBe(false);
  });
  it('admin must also own the business; staff and customers never', () => {
    expect(canReplyToReview({ role: 'ADMIN', id: 'u1' }, biz)).toBe(true);
    expect(canReplyToReview({ role: 'ADMIN', id: 'u9' }, biz)).toBe(false);
    expect(canReplyToReview({ role: 'STAFF', id: 'u1' }, biz)).toBe(false);
    expect(canReplyToReview({ role: 'CUSTOMER', id: 'u1' }, biz)).toBe(false);
  });
});

describe('computeRatingAggregate', () => {
  it('empty', () => expect(computeRatingAggregate([])).toEqual({ ratingAvg: 0, ratingCount: 0 }));
  it('averages to one decimal', () => {
    expect(computeRatingAggregate([5, 4, 4])).toEqual({ ratingAvg: 4.3, ratingCount: 3 });
    expect(computeRatingAggregate([5])).toEqual({ ratingAvg: 5, ratingCount: 1 });
  });
});
