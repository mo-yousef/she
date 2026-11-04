'use server';
/**
 * Owner reply actions (task 5.5). Thin wrappers: session lookup + revalidation. The
 * authorisation decision lives in lib/review-reply.ts (role from the DB, business owned
 * by the actor). The dashboard form that calls these is mounted by task 6.8.
 */
import { revalidateAfterOwnerEdit } from '@/lib/owner-effects';
import { auth } from '@/lib/auth';
import { removeReviewReplyCore, replyToReviewCore, type ReplyResult } from '@/lib/review-reply';

export type ReplyActionResult = { ok: true } | { ok: false; code: Exclude<ReplyResult, { ok: true }>['code'] };

async function run(fn: (userId: string | null, input: unknown) => Promise<ReplyResult>, input: unknown) {
  const session = await auth();
  const res = await fn(session?.user?.id ?? null, input);
  if (!res.ok) return res;
  // The reply shows on the public page (all locales) and in the dashboard reviews list.
  revalidateAfterOwnerEdit({ business: { id: res.businessId, slug: res.slug }, surfaces: ['public', 'reviews'] });
  return { ok: true as const };
}

export async function replyToReview(input: unknown): Promise<ReplyActionResult> {
  return run(replyToReviewCore, input);
}

export async function removeReviewReply(input: unknown): Promise<ReplyActionResult> {
  return run(removeReviewReplyCore, input);
}
