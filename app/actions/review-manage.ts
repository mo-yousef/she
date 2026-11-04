'use server';
/** Thin wrapper for the owner's "Report review" action (task 6.8). Rules live in lib/review-manage.ts. */
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';
import { auth } from '@/lib/auth';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { reportReviewCore } from '@/lib/review-manage';

export async function reportReview(raw: unknown) {
  const userId = (await auth())?.user?.id ?? null;
  const businessId = userId ? await findOwnerBusinessId(userId) : null;
  if (!userId) return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  if (!businessId) return { ok: false as const, code: 'FORBIDDEN' as const };
  const res = await reportReviewCore(userId, businessId, raw);
  // A report changes nothing on the public page (FLAGGED stays public): dashboard only.
  if (res.ok) revalidateAfterOwnerEdit({ business: { id: res.businessId, slug: res.slug }, surfaces: ['reviews'] });
  return res.ok ? { ok: true as const, alreadyFlagged: res.alreadyFlagged } : res;
}
