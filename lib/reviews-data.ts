/** Dashboard reviews loader (task 6.8). Server-only; every query is scoped to the owner's business. */
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { PUBLIC_REVIEW_STATUSES } from './review-visibility';
import { computeRatingDistribution, isVerifiedReview } from './reviews';
import { REVIEWS_PAGE_SIZE, clampPage, type ReviewFilter, type ReviewsParams } from './reviews-params';

export function reviewsWhere(businessId: string, filter: ReviewFilter): Prisma.ReviewWhereInput {
  const pub = { in: [...PUBLIC_REVIEW_STATUSES] };
  switch (filter) {
    case 'needsReply':
      return { businessId, status: pub, ownerReply: null };
    case 'replied':
      return { businessId, ownerReply: { not: null } };
    case 'reported':
      return { businessId, status: 'FLAGGED' };
    default:
      return { businessId };
  }
}

export async function loadReviewsForDashboard(businessId: string, p: ReviewsParams) {
  const where = reviewsWhere(businessId, p.filter);
  const [total, ratings, openReports, totalAll] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({ where: { businessId, status: { in: [...PUBLIC_REVIEW_STATUSES] } }, select: { rating: true } }),
    db.review.count({ where: { businessId, status: 'FLAGGED' } }),
    db.review.count({ where: { businessId } }),
  ]);
  const { page, pageCount } = clampPage(p.page, total);
  const rows = await db.review.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * REVIEWS_PAGE_SIZE,
    take: REVIEWS_PAGE_SIZE,
    include: { booking: { select: { status: true } } },
  });
  const count = ratings.length;
  return {
    total,
    totalAll,
    page,
    pageCount,
    openReports,
    count,
    average: count ? ratings.reduce((a, r) => a + r.rating, 0) / count : 0,
    distribution: computeRatingDistribution(ratings),
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      authorName: r.authorName,
      body: r.body,
      ownerReply: r.ownerReply,
      status: r.status,
      createdAt: r.createdAt,
      verified: isVerifiedReview(r),
    })),
  };
}
