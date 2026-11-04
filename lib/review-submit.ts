/**
 * Review submission core (task 5.5, req 2.2 + 7). Server-only. The 'use server' file
 * `app/actions/review.ts` is a thin wrapper; all decisions live here so they can be
 * exercised directly with explicit inputs (session user id, token, receipt, clock).
 *
 * Trust boundaries re-checked on every call (never trusting the page): signed manage
 * token, booking COMPLETED, review window, OTP proof (already-verified customer OR a
 * receipt signed for this very booking), one review per booking (unique bookingId).
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { verifyManageToken } from './tokens';
import { verifyOtpReceipt } from './review-otp';
import { lockBusiness, recomputeBusinessRating } from './review-rating';
import { authorDisplayName, isWithinReviewWindow, submitReviewSchema } from './review-schema';

const identitySchema = z.object({
  businessSlug: z.string().min(1).max(80),
  reference: z.string().regex(/^SC-[A-Z0-9]{5}$/),
  token: z.string().min(1).max(200),
});

const BOOKING_SELECT = {
  id: true,
  businessId: true,
  reference: true,
  status: true,
  startsAt: true,
  endsAt: true,
  locale: true,
  guestName: true,
  guestPhone: true,
  customerId: true,
  manageTokenHash: true,
  service: { select: { name: true } },
  staff: { select: { name: true } },
  business: { select: { name: true, slug: true, brandPrimary: true, brandAccent: true } },
  review: { select: { id: true } },
} satisfies Prisma.BookingSelect;

/** Token-gated lookup. Null on EVERY failure (bad params, unknown reference, bad token). */
export async function loadReviewBooking(input: { businessSlug: string; reference: string; token: string | undefined }) {
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) return null;
  const { businessSlug, reference, token } = parsed.data;
  const booking = await db.booking.findFirst({
    where: { reference, business: { slug: businessSlug } },
    select: BOOKING_SELECT,
  });
  if (!booking || !verifyManageToken(token, booking.manageTokenHash)) return null;
  return booking;
}
export type ReviewBooking = NonNullable<Awaited<ReturnType<typeof loadReviewBooking>>>;

export type Eligibility = 'ELIGIBLE' | 'ALREADY_REVIEWED' | 'NOT_COMPLETED' | 'WINDOW_PASSED';

/** Pure: what state is this (verified) booking in with respect to reviewing? */
export function reviewEligibility(
  b: { status: string; endsAt: Date; review: { id: string } | null },
  now: Date,
): Eligibility {
  if (b.status !== 'COMPLETED') return 'NOT_COMPLETED';
  if (b.review) return 'ALREADY_REVIEWED';
  if (!isWithinReviewWindow(b.endsAt, now)) return 'WINDOW_PASSED';
  return 'ELIGIBLE';
}

/**
 * True when the signed-in user IS the booking's customer and their verified phone is the
 * booking's phone, so no OTP is needed.
 */
export async function phoneAlreadyVerified(
  userId: string | null,
  booking: { customerId: string | null; guestPhone: string | null },
): Promise<boolean> {
  if (!userId || !booking.customerId || booking.customerId !== userId || !booking.guestPhone) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { phone: true, phoneVerifiedAt: true } });
  return !!user?.phoneVerifiedAt && user.phone === booking.guestPhone;
}

/**
 * After a successful OTP: if the signed-in user is the booking's customer (and has no
 * conflicting phone on file), remember the verified phone so they skip OTP next time.
 * Guests get nothing stored; their proof is the signed receipt.
 */
export async function rememberVerifiedPhone(
  userId: string | null,
  booking: { customerId: string | null; guestPhone: string | null },
  now: Date,
): Promise<void> {
  if (!userId || !booking.customerId || booking.customerId !== userId || !booking.guestPhone) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user || (user.phone && user.phone !== booking.guestPhone)) return;
  await db.user.update({ where: { id: userId }, data: { phone: booking.guestPhone, phoneVerifiedAt: now } });
}

export type SubmitReviewResult =
  | { ok: true; reviewId: string }
  | {
    ok: false;
    code:
      | 'VALIDATION'
      | 'NOT_FOUND'
      | 'NOT_COMPLETED'
      | 'WINDOW_PASSED'
      | 'ALREADY_REVIEWED'
      | 'VERIFICATION_REQUIRED'
      | 'UNKNOWN';
  };

const NAME_FALLBACK = { en: 'Customer', el: 'Πελάτης', ru: 'Клиент' } as const;

export async function submitReviewCore(
  rawInput: unknown,
  ctx: { userId: string | null; now?: Date },
): Promise<SubmitReviewResult> {
  const now = ctx.now ?? new Date();
  const parsed = submitReviewSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'VALIDATION' };
  const input = parsed.data;

  const booking = await loadReviewBooking(input);
  if (!booking) return { ok: false, code: 'NOT_FOUND' };

  const state = reviewEligibility(booking, now);
  if (state !== 'ELIGIBLE') return { ok: false, code: state };

  const verified =
    verifyOtpReceipt(booking.id, input.receipt, now.getTime()) || (await phoneAlreadyVerified(ctx.userId, booking));
  if (!verified) return { ok: false, code: 'VERIFICATION_REQUIRED' };

  const locale = booking.locale === 'el' || booking.locale === 'ru' ? booking.locale : 'en';
  const authorName = authorDisplayName(booking.guestName, NAME_FALLBACK[locale]);

  try {
    const review = await db.$transaction(async (tx) => {
      // Serialise rating updates for this business, then insert + recompute atomically.
      await lockBusiness(tx, booking.businessId);
      const created = await tx.review.create({
        data: {
          businessId: booking.businessId,
          bookingId: booking.id,
          authorName,
          rating: input.rating,
          body: input.body ?? null,
        },
        select: { id: true },
      });
      await recomputeBusinessRating(tx, booking.businessId);
      return created;
    });
    return { ok: true, reviewId: review.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, code: 'ALREADY_REVIEWED' };
    }
    console.error('submitReview failed', e instanceof Error ? e.name : 'unknown');
    return { ok: false, code: 'UNKNOWN' };
  }
}
