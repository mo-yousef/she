/**
 * Owner reply core (task 5.5). Server-only; `app/actions/review-reply.ts` is the thin
 * 'use server' wrapper. Authorisation is decided HERE from the database, not from the
 * session's cached role: the actor's role is re-read and the review's business owner is
 * compared with the actor id (`canReplyToReview`). Staff and other owners are refused.
 */
import { db } from './db';
import { canReplyToReview, ownerReplySchema, removeReplySchema } from './review-schema';

export type ReplyResult =
  | { ok: true; slug: string; businessId: string }
  | { ok: false; code: 'UNAUTHENTICATED' | 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'UNKNOWN' };

type Denied = Exclude<ReplyResult, { ok: true }>['code'];

async function authorise(userId: string | null, reviewId: string) {
  if (!userId) return { error: 'UNAUTHENTICATED' as Denied };
  const [actor, review] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    db.review.findUnique({
      where: { id: reviewId },
      select: { id: true, businessId: true, business: { select: { ownerId: true, slug: true } } },
    }),
  ]);
  if (!actor) return { error: 'UNAUTHENTICATED' as Denied };
  // The caller is a signed-in dashboard user; a non-owner learns nothing about the review's content.
  if (!review) return { error: 'NOT_FOUND' as Denied };
  if (!canReplyToReview(actor, review.business)) return { error: 'FORBIDDEN' as Denied };
  return { actor, review };
}

async function write(userId: string | null, rawInput: unknown, remove: boolean): Promise<ReplyResult> {
  let reviewId: string;
  let reply: string | null = null;
  if (remove) {
    const parsed = removeReplySchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, code: 'VALIDATION' };
    reviewId = parsed.data.reviewId;
  } else {
    const parsed = ownerReplySchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, code: 'VALIDATION' };
    reviewId = parsed.data.reviewId;
    reply = parsed.data.body;
  }
  try {
    const auth = await authorise(userId, reviewId);
    if ('error' in auth) return { ok: false, code: auth.error as Denied };
    const { actor, review } = auth;
    await db.$transaction([
      db.review.update({
        where: { id: review.id },
        data: { ownerReply: reply },
      }),
      // Ids only: never the reply text.
      db.auditLog.create({
        data: {
          actorId: actor.id,
          businessId: review.businessId,
          action: remove ? 'review.reply.remove' : 'review.reply',
          meta: { reviewId: review.id },
        },
      }),
    ]);
    return { ok: true, slug: review.business.slug, businessId: review.businessId };
  } catch (e) {
    console.error('review reply failed', e instanceof Error ? e.name : 'unknown');
    return { ok: false, code: 'UNKNOWN' };
  }
}

export const replyToReviewCore = (userId: string | null, input: unknown) => write(userId, input, false);
export const removeReviewReplyCore = (userId: string | null, input: unknown) => write(userId, input, true);
