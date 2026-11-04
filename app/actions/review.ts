'use server';
/**
 * Review actions (task 5.5, req 2.2 + 7): send/verify the phone OTP and submit the
 * review. Thin wrappers: they add the session user, client IP rate limits and cache
 * revalidation; every decision lives in lib/review-submit.ts / lib/review-verification.ts.
 * Each action re-verifies the signed manage token itself (its own trust boundary).
 */
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { sendReviewOtp, verifyReviewOtp, type SendOtpResult } from '@/lib/review-verification';
import { sendOtpSchema, verifyOtpSchema } from '@/lib/review-schema';
import {
  loadReviewBooking,
  phoneAlreadyVerified,
  rememberVerifiedPhone,
  reviewEligibility,
  submitReviewCore,
  type SubmitReviewResult,
} from '@/lib/review-submit';

const OTP_SEND_IP_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 } as const;
const OTP_VERIFY_IP_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 } as const;

type Fail<C extends string> = { ok: false; code: C };

export type RequestCodeResult =
  | Extract<SendOtpResult, { ok: true }>
  | {
    ok: false;
    code:
    | Extract<SendOtpResult, { ok: false }>['code']
    | 'NOT_FOUND'
    | 'NOT_ELIGIBLE'
    | 'RATE_LIMITED'
    | 'VALIDATION'
    | 'ALREADY_VERIFIED';
    retryAfterSec?: number;
  };

export async function requestReviewCode(input: unknown): Promise<RequestCodeResult> {
  const parsed = sendOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION' };
  const ip = clientIp(await headers());
  if (!rateLimit(`review-otp-send:ip:${ip ?? 'unknown'}`, OTP_SEND_IP_LIMIT)) {
    return { ok: false, code: 'RATE_LIMITED' };
  }
  const booking = await loadReviewBooking(parsed.data);
  if (!booking) return { ok: false, code: 'NOT_FOUND' };
  if (reviewEligibility(booking, new Date()) !== 'ELIGIBLE') return { ok: false, code: 'NOT_ELIGIBLE' };
  const session = await auth();
  if (await phoneAlreadyVerified(session?.user?.id ?? null, booking)) return { ok: false, code: 'ALREADY_VERIFIED' };
  return sendReviewOtp({
    id: booking.id,
    guestPhone: booking.guestPhone,
    locale: booking.locale,
    businessName: booking.business.name,
  });
}

export type VerifyCodeResult =
  | { ok: true; receipt: string }
  | { ok: false; code: 'NO_CODE' | 'EXPIRED' | 'LOCKED' | 'WRONG' | 'NOT_FOUND' | 'NOT_ELIGIBLE' | 'RATE_LIMITED' | 'VALIDATION'; attemptsLeft?: number };

export async function verifyReviewCode(input: unknown): Promise<VerifyCodeResult> {
  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION' };
  const ip = clientIp(await headers());
  if (!rateLimit(`review-otp-verify:ip:${ip ?? 'unknown'}`, OTP_VERIFY_IP_LIMIT)) {
    return { ok: false, code: 'RATE_LIMITED' };
  }
  const booking = await loadReviewBooking(parsed.data);
  if (!booking) return { ok: false, code: 'NOT_FOUND' };
  const now = new Date();
  if (reviewEligibility(booking, now) !== 'ELIGIBLE') return { ok: false, code: 'NOT_ELIGIBLE' };
  const res = await verifyReviewOtp(booking.id, parsed.data.code, now);
  if (!res.ok) return res;
  const session = await auth();
  await rememberVerifiedPhone(session?.user?.id ?? null, booking, now);
  return { ok: true, receipt: res.receipt.token };
}

export type SubmitReviewActionResult = SubmitReviewResult | Fail<'RATE_LIMITED'>;

export async function submitReview(input: unknown): Promise<SubmitReviewActionResult> {
  const ip = clientIp(await headers());
  if (!rateLimit(`review-submit:ip:${ip ?? 'unknown'}`, { limit: 10, windowMs: 10 * 60 * 1000 })) {
    return { ok: false, code: 'RATE_LIMITED' };
  }
  const session = await auth();
  const res = await submitReviewCore(input, { userId: session?.user?.id ?? null });
  if (res.ok) {
    // Rating columns feed the business page, home and search cards.
    revalidatePath('/[locale]/b/[slug]', 'page');
    revalidatePath('/[locale]', 'page');
    revalidatePath('/[locale]/search', 'page');
  }
  return res;
}
