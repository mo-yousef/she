/**
 * Which review statuses the public sees and the rating aggregate counts (task 6.8).
 * ONE constant for the public page query, the distribution, `recomputeBusinessRating`
 * (and so search / cards via Business.ratingAvg). FLAGGED = "reported by the owner,
 * pending admin review": it stays public so an owner cannot hide a bad review by
 * reporting it. Only HIDDEN (admin-only, task 7.1) removes a review everywhere.
 */
import type { ReviewStatus } from '@prisma/client';

export const PUBLIC_REVIEW_STATUSES = ['VISIBLE', 'FLAGGED'] as const satisfies readonly ReviewStatus[];

export function isPublicReviewStatus(status: string): boolean {
  return (PUBLIC_REVIEW_STATUSES as readonly string[]).includes(status);
}
