/**
 * DB-backed review OTP (task 5.5, requirement 7). Server-only.
 *
 * The code goes to the phone ON THE COMPLETED BOOKING (WhatsApp, SMS fallback), which
 * proves the reviewer controls the number that booked. The code is never returned to
 * the client and never logged, except the dev-only hatch below. Only its HMAC is stored.
 */
import { db } from './db';
import { getNotifier } from './notify';
import { recordNotification } from './notify/log';
import type { Notifier, NotifyLocale } from './notify/types';
import {
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  codeState,
  createOtpReceipt,
  generateOtpCode,
  hashOtpCode,
  maskPhone,
  sendThrottle,
  shouldLogDevOtp,
  verifyOtpHash,
  type OtpReceipt,
} from './review-otp';

const E164 = /^\+\d{8,15}$/;
const toLocale = (l: string): NotifyLocale => (l === 'el' || l === 'ru' ? l : 'en');

/** Default body renderer; loaded lazily (it imports the message JSON). Tests inject their own. */
async function defaultBody(locale: string, business: string, code: string): Promise<string> {
  const { otpMessageBody } = await import('./review-otp-message');
  return otpMessageBody(locale, business, code);
}

export type SendOtpResult =
  | { ok: true; maskedPhone: string }
  | { ok: false; code: 'NO_PHONE' | 'COOLDOWN' | 'CAP' | 'SEND_FAILED'; retryAfterSec?: number };

export async function sendReviewOtp(
  booking: { id: string; guestPhone: string | null; locale: string; businessName: string },
  opts: {
    notifier?: Notifier;
    now?: Date;
    renderBody?: (locale: string, business: string, code: string) => string | Promise<string>;
  } = {},
): Promise<SendOtpResult> {
  const now = opts.now ?? new Date();
  const phone = (booking.guestPhone ?? '').replace(/[\s()-]/g, '');
  if (!E164.test(phone)) return { ok: false, code: 'NO_PHONE' };

  const code = generateOtpCode();
  // Lock the booking row so two parallel requests cannot both pass the throttle.
  const created = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${booking.id} FOR UPDATE`;
    const recent = await tx.phoneVerification.findMany({
      where: { bookingId: booking.id, createdAt: { gt: new Date(now.getTime() - 3_600_000) } },
      select: { createdAt: true },
    });
    const throttle = sendThrottle(
      recent.map((r) => r.createdAt),
      now,
    );
    if (!throttle.ok) return throttle;
    // A new code invalidates any earlier unused one.
    await tx.phoneVerification.updateMany({
      where: { bookingId: booking.id, consumedAt: null },
      data: { consumedAt: now },
    });
    const row = await tx.phoneVerification.create({
      data: {
        bookingId: booking.id,
        codeHash: hashOtpCode(booking.id, code),
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
        createdAt: now,
      },
      select: { id: true },
    });
    return { ok: true as const, id: row.id };
  });
  if (!created.ok) return { ok: false, code: created.reason, retryAfterSec: created.retryAfterSec };

  const result = await (opts.notifier ?? getNotifier()).sendPhone({
    to: phone,
    body: await (opts.renderBody ?? defaultBody)(booking.locale, booking.businessName, code),
    locale: toLocale(booking.locale),
    template: 'review-otp',
  });
  await recordNotification({ bookingId: booking.id, template: 'review-otp', result });

  // shortcut: dev-only escape hatch. With no Twilio keys the code could never be
  // delivered, so print it to the server console ONLY when NODE_ENV === 'development'.
  // Never in production or test. Mirrors the Turnstile skip in lib/turnstile.ts.
  if (!result.ok && shouldLogDevOtp(process.env)) {
    console.warn(`[review-otp] DEV ONLY booking=${booking.id} code=${code}`);
    return { ok: true, maskedPhone: maskPhone(phone) };
  }
  if (!result.ok) {
    // Undelivered: drop the code so the customer can retry without waiting for the cooldown.
    await db.phoneVerification.delete({ where: { id: created.id } }).catch(() => undefined);
    return { ok: false, code: 'SEND_FAILED' };
  }
  return { ok: true, maskedPhone: maskPhone(phone) };
}

export type VerifyOtpResult =
  | { ok: true; receipt: OtpReceipt }
  | { ok: false; code: 'NO_CODE' | 'EXPIRED' | 'LOCKED' | 'WRONG'; attemptsLeft?: number };

/**
 * Checks a guess against the booking's latest unused code. Each guess is counted with a
 * guarded atomic increment BEFORE comparing, so parallel guesses cannot exceed the cap.
 * A correct code is consumed atomically (single use).
 */
export async function verifyReviewOtp(
  bookingId: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifyOtpResult> {
  const rec = await db.phoneVerification.findFirst({
    where: { bookingId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return { ok: false, code: 'NO_CODE' };
  const state = codeState(rec, now);
  if (state === 'EXPIRED') return { ok: false, code: 'EXPIRED' };
  if (state === 'LOCKED') return { ok: false, code: 'LOCKED' };
  if (state === 'USED') return { ok: false, code: 'NO_CODE' };

  const counted = await db.phoneVerification.updateMany({
    where: { id: rec.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS }, expiresAt: { gt: now } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) return { ok: false, code: 'LOCKED' };

  if (!verifyOtpHash(rec.codeHash, hashOtpCode(bookingId, code))) {
    const left = OTP_MAX_ATTEMPTS - (rec.attempts + 1);
    return left <= 0 ? { ok: false, code: 'LOCKED' } : { ok: false, code: 'WRONG', attemptsLeft: left };
  }
  const used = await db.phoneVerification.updateMany({
    where: { id: rec.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (used.count === 0) return { ok: false, code: 'NO_CODE' };
  return { ok: true, receipt: createOtpReceipt(bookingId, now.getTime()) };
}
