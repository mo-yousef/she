/**
 * Pure validation + domain rules for review submission (task 5.5, req 2.2).
 * No DB access; `app/actions/review.ts` wires this to Prisma.
 */
import { z } from 'zod';

/** Reviews are rejected once the appointment ended more than this long ago. */
export const REVIEW_WINDOW_DAYS = 30;
export const REVIEW_BODY_MAX = 2000;
export const OWNER_REPLY_MAX = 1000;

export function isWithinReviewWindow(endsAt: Date, now: Date, windowDays = REVIEW_WINDOW_DAYS): boolean {
  return now.getTime() - endsAt.getTime() <= windowDays * 86_400_000;
}

export const submitReviewSchema = z.object({
  businessSlug: z.string().min(1).max(80),
  reference: z.string().regex(/^SC-[A-Z0-9]{5}$/),
  token: z.string().min(1).max(200),
  receipt: z.string().min(1).max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .max(REVIEW_BODY_MAX)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const sendOtpSchema = z.object({
  businessSlug: z.string().min(1).max(80),
  reference: z.string().regex(/^SC-[A-Z0-9]{5}$/),
  token: z.string().min(1).max(200),
});

export const verifyOtpSchema = sendOtpSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/),
});

/**
 * "First name + initial" display name, derived from the booking's own guestName
 * (or the signed-in customer's name) so a reviewer cannot type an arbitrary
 * author identity. Falls back to a neutral label when there is nothing usable.
 */
export function authorDisplayName(fullName: string | null | undefined, fallback: string): string {
  const trimmed = (fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return fallback;
  const parts = trimmed.split(' ');
  const first = parts[0]!;
  const rest = parts.slice(1).join(' ');
  const initial = rest.trim()[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

export const ownerReplySchema = z.object({
  reviewId: z.string().min(1).max(60),
  body: z.string().trim().min(1).max(OWNER_REPLY_MAX),
});

export const removeReplySchema = z.object({ reviewId: z.string().min(1).max(60) });

/**
 * Pure authorisation predicate for owner replies: role OWNER or ADMIN AND the actor
 * owns the business the review belongs to. Staff and customers never qualify; an
 * ADMIN who does not own the business is also refused (admin moderation is 7.1).
 */
export function canReplyToReview(actor: { role: string; id: string }, business: { ownerId: string }): boolean {
  if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') return false;
  return actor.id === business.ownerId;
}
