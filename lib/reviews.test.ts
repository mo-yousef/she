import { describe, it, expect } from 'vitest';
import { computeRatingDistribution, isVerifiedReview } from './reviews';

const r = (rating: number, status = 'COMPLETED') => ({ rating, booking: { status } });

describe('computeRatingDistribution', () => {
  it('returns 5★..1★ rows with counts and rounded percentages', () => {
    const rows = computeRatingDistribution([r(5), r(5), r(4), r(1)]);
    expect(rows.map((x) => x.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map((x) => x.count)).toEqual([2, 1, 0, 0, 1]);
    expect(rows.map((x) => x.percent)).toEqual([50, 25, 0, 0, 25]);
  });
  it('handles no reviews without dividing by zero', () => {
    expect(computeRatingDistribution([]).every((x) => x.count === 0 && x.percent === 0)).toBe(true);
  });
});

describe('isVerifiedReview', () => {
  it('is true only for COMPLETED bookings', () => {
    expect(isVerifiedReview(r(5, 'COMPLETED'))).toBe(true);
    expect(isVerifiedReview(r(5, 'CONFIRMED'))).toBe(false);
    expect(isVerifiedReview(r(5, 'CANCELLED'))).toBe(false);
  });
});
