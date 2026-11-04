/**
 * Pure helpers for the business profile reviews section (req 2.2), plus the
 * rating-aggregate recompute shared by review submission (5.5) and the later
 * hide/show (6.8) and moderation (7.1) flows so `Business.ratingAvg/ratingCount`
 * never drifts from the VISIBLE review rows.
 * No DB access here — callers pass already-fetched rows.
 */

export type ReviewForDisplay = {
  rating: number; // 1..5
};

/** A review counts as "Verified visit" only if its booking reached COMPLETED. */
export function isVerifiedReview(review: { booking: { status: string } }): boolean {
  return review.booking.status === 'COMPLETED';
}

/** Pure aggregate from VISIBLE ratings: average rounded to 1 decimal, and the count. */
export function computeRatingAggregate(visibleRatings: number[]): { ratingAvg: number; ratingCount: number } {
  const count = visibleRatings.length;
  if (count === 0) return { ratingAvg: 0, ratingCount: 0 };
  const sum = visibleRatings.reduce((a, b) => a + b, 0);
  return { ratingAvg: Math.round((sum / count) * 10) / 10, ratingCount: count };
}

export type RatingDistributionRow = {
  stars: number; // 5..1
  count: number;
  percent: number; // 0..100, rounded
};

/** Buckets ratings into 5★..1★ counts and percentages of the total. */
export function computeRatingDistribution(reviews: ReviewForDisplay[]): RatingDistributionRow[] {
  const counts = new Map<number, number>();
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating)));
    counts.set(star, (counts.get(star) ?? 0) + 1);
  }
  const total = reviews.length;
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = counts.get(stars) ?? 0;
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    return { stars, count, percent };
  });
}
