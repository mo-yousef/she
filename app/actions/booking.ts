'use server';
import { captureError } from '@/lib/monitoring';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { BOOKING_IP_LIMIT, BOOKING_PHONE_LIMIT, clientIp, rateLimit } from '@/lib/rate-limit';
import { turnstileMode, verifyTurnstile } from '@/lib/turnstile';
import { auth } from '@/lib/auth';
import { createBookingRecord } from '@/lib/booking';
import { bookingInputSchema, type CreateBookingResult } from '@/lib/booking-schema';
import { availabilityTag } from '@/lib/next-slot';
import { queueBookingNotice } from '@/lib/notify/booking-notices';

/**
 * Create a booking (requirements 3.1, 4.1). The client sends untrusted input; this
 * action parses it, takes the customer from the SESSION only, and delegates to
 * lib/booking.ts (server-side re-validation, transaction, idempotency).
 *
 * Confirmation route contract for task 4.4 (locale prefix added by the i18n router):
 *   /b/{slug}/booked/{reference}?t={manageToken}
 * `t` is the raw signed manage token; 4.4/4.5 verify it with verifyManageToken()
 * against Booking.manageTokenHash and must look the booking up by `reference`.
 */
export async function createBooking(input: unknown): Promise<CreateBookingResult> {
  const parsed = bookingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION' };

  try {
    const session = await auth();
    const customerId = session?.user?.id;

    // Abuse protection (req 9), after the cheap shape check and before any DB work.
    // Both limits are consumed on every attempt, so a valid-but-limited request and a
    // limited junk request are indistinguishable only by shape (already checked above).
    const ip = clientIp(await headers());
    // Unknown IP: skip the IP bucket (a shared "unknown" bucket would lock everyone out);
    // the per-phone limit and Turnstile still apply.
    const ipOk = ip ? rateLimit(`ip:${ip}`, BOOKING_IP_LIMIT) : true;
    const phoneOk = rateLimit(`phone:${parsed.data.details.phone}`, BOOKING_PHONE_LIMIT);
    if (!ipOk || !phoneOk) return { ok: false, code: 'RATE_LIMITED' };

    // Turnstile: guests only (signed-in customers already passed Auth.js sign-in).
    if (!customerId) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (turnstileMode(process.env) === 'enforce') {
        const v = await verifyTurnstile({ token: parsed.data.turnstileToken, secret, ip });
        if (!v.ok) {
          if (v.reason === 'MISCONFIGURED') console.warn('Turnstile secret key missing or invalid');
          return { ok: false, code: 'VERIFICATION_FAILED' };
        }
      }
    }

    const result = await createBookingRecord({
      input: parsed.data,
      customerId,
    });
    if (!result.ok) return { ok: false, code: result.code };

    // The slot is gone from availability: drop the cached "next slot" on cards.
    if (result.created) {
      revalidateTag(availabilityTag(result.businessId));
      // Confirmation to the customer + new-booking notice to the business, after the
      // response is sent. Never throws, never delays or fails the booking.
      queueBookingNotice('created', result.bookingId);
    }

    return {
      ok: true,
      reference: result.reference,
      redirectTo: `/b/${parsed.data.businessSlug}/booked/${result.reference}?t=${result.manageToken}`,
    };
  } catch (e) {
    // No PII in logs: error name only, never the input or the message (may echo values).
    console.error('createBooking failed', e instanceof Error ? e.name : 'unknown');
    captureError(e, { area: 'createBooking' });
    return { ok: false, code: 'UNKNOWN' };
  }
}
