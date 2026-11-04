/**
 * Owner-side review moderation (task 6.8, req 5.1). Server-only; `app/actions/review-manage.ts`
 * holds the thin wrapper. Owners can only REPORT (VISIBLE -> FLAGGED). A report does not hide
 * anything (see lib/review-visibility.ts): the owner cannot suppress a review; an admin decides
 * in 7.1 (FLAGGED -> HIDDEN or back to VISIBLE using lockBusiness + recomputeBusinessRating).
 * The reason is a fixed code kept in the audit row (`review.flag`, ids + code only, no text).
 */
import { db } from './db';
import { writeAudit } from './audit';
import { assertOwnsBusiness, ownerAuthCode, type OwnerAuthCode } from './owner-auth';
import { lockBusiness } from './review-rating';
import { MAX_OPEN_REPORTS, reportReviewSchema } from './review-report';

export type ReportResult =
  | { ok: true; businessId: string; slug: string; alreadyFlagged: boolean }
  | { ok: false; code: OwnerAuthCode | 'VALIDATION' | 'NOT_FOUND' | 'NOT_ALLOWED' | 'LIMIT_REACHED' | 'UNKNOWN' };

const fail = (code: Extract<ReportResult, { ok: false }>['code']): ReportResult => ({ ok: false, code });

export async function reportReviewCore(userId: string | null | undefined, businessId: string, raw: unknown): Promise<ReportResult> {
  let owned;
  try {
    owned = await assertOwnsBusiness(userId, businessId);
  } catch (e) {
    return fail(ownerAuthCode(e));
  }
  const parsed = reportReviewSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION');
  const { reviewId, reason } = parsed.data;
  try {
    return await db.$transaction(async (tx): Promise<ReportResult> => {
      await lockBusiness(tx, owned.business.id); // serialises the open-report cap
      // Scoped to THIS business: another business's review id is NOT_FOUND.
      const review = await tx.review.findFirst({ where: { id: reviewId, businessId: owned.business.id }, select: { id: true, status: true } });
      if (!review) return fail('NOT_FOUND');
      const base = { ok: true as const, businessId: owned.business.id, slug: owned.business.slug };
      if (review.status === 'FLAGGED') return { ...base, alreadyFlagged: true };
      if (review.status !== 'VISIBLE') return fail('NOT_ALLOWED'); // HIDDEN: admin-only
      const open = await tx.review.count({ where: { businessId: owned.business.id, status: 'FLAGGED' } });
      if (open >= MAX_OPEN_REPORTS) return fail('LIMIT_REACHED');
      await tx.review.update({ where: { id: review.id }, data: { status: 'FLAGGED' } });
      await writeAudit({ actorId: owned.user.id, businessId: owned.business.id, action: 'review.flag', meta: { reviewId: review.id, reason } }, tx);
      return { ...base, alreadyFlagged: false };
    });
  } catch (e) {
    console.error('review report failed', e instanceof Error ? e.name : 'unknown');
    return fail('UNKNOWN');
  }
}
