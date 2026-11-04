/**
 * Recomputes Business.ratingAvg / ratingCount from its public (VISIBLE + FLAGGED) reviews. Call it inside
 * the same transaction as any review insert / hide / show / moderation change, AFTER
 * locking the business row with `lockBusiness` so concurrent writers serialise and the
 * last one always sees every committed change (no drift). Server-only.
 */
import type { Prisma } from '@prisma/client';
import { computeRatingAggregate } from './reviews';
import { PUBLIC_REVIEW_STATUSES } from './review-visibility';

export async function lockBusiness(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
}

export async function recomputeBusinessRating(tx: Prisma.TransactionClient, businessId: string) {
  const rows = await tx.review.findMany({
    where: { businessId, status: { in: [...PUBLIC_REVIEW_STATUSES] } },
    select: { rating: true },
  });
  const agg = computeRatingAggregate(rows.map((r) => r.rating));
  await tx.business.update({ where: { id: businessId }, data: agg });
  return agg;
}
