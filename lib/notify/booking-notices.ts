/**
 * Sends the immediate booking notices (confirmation / new-booking / reschedule /
 * cancellation) to the customer and the business owner. Server-only.
 *
 * Contract: never throws and never logs PII. A failed notice must not affect the
 * booking action that triggered it, so callers use `queueBookingNotice` (runs after the
 * response via Next's `after()`).
 */
import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { manageTokenFor } from '../booking';
import { verifyManageToken } from '../tokens';
import { getNotifier } from '.';
import { recordNotification } from './log';
import { audienceTemplate } from './status';
import {
  renderBookingEmail,
  renderBookingPhoneBody,
  type TemplateKind,
} from './templates';
import { bookingToTemplateData, toNotifyLocale } from './templates/from-booking';
import type { Audience } from './templates/types';
import type { Notifier, SendResult } from './types';

export type BookingNoticeEvent = 'created' | 'rescheduled' | 'cancelled';

const E164 = /^\+\d{8,15}$/;
const cleanPhone = (p: string | null | undefined) => {
  const s = (p ?? '').replace(/[\s()-]/g, '');
  return E164.test(s) ? s : null;
};

/**
 * Writes the NotificationLog row for one send result (task 5.4). `audience` picks the
 * template suffix used to tell customer- and business-facing rows apart (the log has
 * no audience column; see `audienceTemplate`). Awaited at both call sites so the write
 * finishes before `after()` (or the cron handler) completes.
 */
function recordResult(
  bookingId: string,
  template: string,
  result: SendResult,
  audience: Audience = 'customer',
): Promise<void> {
  return recordNotification({
    bookingId,
    template: audienceTemplate(template, audience),
    result,
  });
}

const BOOKING_NOTICE_SELECT = {
  id: true,
  reference: true,
  status: true,
  source: true,
  locale: true,
  startsAt: true,
  endsAt: true,
  priceCents: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  note: true,
  manageTokenHash: true,
  service: {
    select: {
      name: true,
      durationMin: true,
      translations: { select: { locale: true, name: true } },
    },
  },
  staff: { select: { name: true } },
  business: {
    select: {
      name: true,
      slug: true,
      address: true,
      city: true,
      brandPrimary: true,
      whatsapp: true,
      owner: { select: { email: true, phone: true, locale: true } },
    },
  },
} satisfies Prisma.BookingSelect;

/**
 * Customer-only scheduled message (cron, task 5.3). Same consent rule as the immediate
 * notices: ONLINE bookings get email + WhatsApp/SMS, MANUAL bookings email only.
 *
 * Never throws and never logs PII. Returns whether the caller should keep its
 * idempotency claim:
 *   - 'done'  at least one send succeeded, or nothing was retriable (no recipient,
 *             INVALID_RECIPIENT, booking gone/ineligible). Keep the claim.
 *   - 'retry' nothing succeeded and at least one result was retriable
 *             (NOT_CONFIGURED / PROVIDER_ERROR / RATE_LIMITED) or rendering threw.
 *             Release the claim so the next run tries again.
 * If one channel succeeds and another fails we return 'done': re-sending would
 * duplicate the message that did arrive.
 */
export async function sendBookingReminder(
  kind: 'reminder-24h' | 'reminder-2h' | 'review-request',
  bookingId: string,
  opts: { notifier?: Notifier } = {},
): Promise<'done' | 'retry'> {
  try {
    const b = await db.booking.findUnique({
      where: { id: bookingId },
      select: BOOKING_NOTICE_SELECT,
    });
    const expected = kind === 'review-request' ? 'COMPLETED' : 'CONFIRMED';
    if (!b || b.status !== expected) return 'done';
    const notifier = opts.notifier ?? getNotifier();

    const rebuilt = manageTokenFor(b.id, b.endsAt).token;
    const token = verifyManageToken(rebuilt, b.manageTokenHash) ? rebuilt : null;
    const locale = toNotifyLocale(b.locale);
    const data = bookingToTemplateData(
      {
        booking: b,
        business: b.business,
        staff: b.staff,
        service: {
          durationMin: b.service.durationMin,
          name:
            b.service.translations.find((t) => t.locale === locale && t.name)?.name ??
            b.service.name,
        },
      },
      { audience: 'customer', locale, manageToken: token },
    );

    const phone = b.source === 'ONLINE' ? cleanPhone(b.guestPhone) : null;
    const sends: Array<Promise<SendResult>> = [];
    if (b.guestEmail) {
      const to = b.guestEmail;
      sends.push(
        renderBookingEmail(kind, data).then((r) =>
          notifier.sendEmail({ to, ...r, locale, template: kind }),
        ),
      );
    }
    if (phone) {
      sends.push(
        notifier.sendPhone({
          to: phone,
          body: renderBookingPhoneBody(kind, data),
          locale,
          template: kind,
        }),
      );
    }

    const settled = await Promise.allSettled(sends);
    let anyOk = false;
    let anyRetriable = false;
    for (const s of settled) {
      if (s.status === 'rejected') {
        anyRetriable = true;
        continue;
      }
      await recordResult(b.id, kind, s.value);
      if (s.value.ok) anyOk = true;
      else if (s.value.code !== 'INVALID_RECIPIENT') anyRetriable = true;
    }
    return !anyOk && anyRetriable ? 'retry' : 'done';
  } catch (e) {
    console.error(`[notify] ${kind} failed`, e instanceof Error ? e.name : 'unknown');
    return 'retry';
  }
}

export async function sendBookingNotice(
  event: BookingNoticeEvent,
  bookingId: string,
  opts: {
    previousStartsAt?: Date;
    notifier?: Notifier;
    /** The owner made this change themselves (dashboard): notify the customer only. */
    skipBusiness?: boolean;
  } = {},
): Promise<void> {
  try {
    const b = await db.booking.findUnique({
      where: { id: bookingId },
      select: BOOKING_NOTICE_SELECT,
    });
    if (!b) return;
    const notifier = opts.notifier ?? getNotifier();

    // The raw token is not stored. It is rebuilt from (id, endsAt) and only used if it
    // matches the stored hash, so a stale rebuild can never put a dead link in a message.
    const rebuilt = manageTokenFor(b.id, b.endsAt).token;
    const customerToken = verifyManageToken(rebuilt, b.manageTokenHash) ? rebuilt : null;

    const customerLocale = toNotifyLocale(b.locale);
    const ownerLocale = toNotifyLocale(b.business.owner.locale);
    const rowsFor = (locale: string) => ({
      booking: b,
      business: b.business,
      staff: b.staff,
      service: {
        durationMin: b.service.durationMin,
        name:
          b.service.translations.find((t) => t.locale === locale && t.name)?.name ??
          b.service.name,
      },
    });

    const customerKind: TemplateKind =
      event === 'created'
        ? 'booking-confirmed'
        : event === 'rescheduled'
          ? 'booking-rescheduled'
          : 'booking-cancelled';
    const businessKind: TemplateKind =
      event === 'created' ? 'booking-new-business' : customerKind;

    const jobs: Array<Promise<void>> = [];
    const deliver = (
      kind: TemplateKind,
      audience: Audience,
      locale: ReturnType<typeof toNotifyLocale>,
      email: string | null | undefined,
      phone: string | null,
    ) => {
      const data = bookingToTemplateData(rowsFor(locale), {
        audience,
        locale,
        manageToken: audience === 'customer' ? customerToken : null,
        previousStartsAt: opts.previousStartsAt,
      });
      if (email) {
        jobs.push(
          renderBookingEmail(kind, data)
            .then((r) => notifier.sendEmail({ to: email, ...r, locale, template: kind }))
            .then((res) => recordResult(b.id, kind, res, audience)),
        );
      }
      if (phone) {
        jobs.push(
          notifier
            .sendPhone({
              to: phone,
              body: renderBookingPhoneBody(kind, data),
              locale,
              template: kind,
            })
            .then((res) => recordResult(b.id, kind, res, audience)),
        );
      }
    };

    // Consent: online bookings require the messages-consent checkbox, so ONLINE counts as
    // consented. Booking has no consent column; MANUAL bookings (task 6.2) are email-only.
    const customerPhone = b.source === 'ONLINE' ? cleanPhone(b.guestPhone) : null;
    deliver(customerKind, 'customer', customerLocale, b.guestEmail, customerPhone);

    // Business contact: owner's email, and the business WhatsApp number (or owner phone).
    if (!opts.skipBusiness) {
      deliver(
        businessKind,
        'business',
        ownerLocale,
        b.business.owner.email,
        cleanPhone(b.business.whatsapp) ?? cleanPhone(b.business.owner.phone),
      );
    }

    // Each job is isolated: one failing channel must not stop the others.
    const settled = await Promise.allSettled(jobs);
    const failed = settled.filter((s) => s.status === 'rejected').length;
    if (failed > 0) console.error(`[notify] ${event} notice: ${failed} send(s) failed`);
  } catch (e) {
    // Error name only: messages can echo recipients or booking values.
    console.error(
      `[notify] ${event} notice failed`,
      e instanceof Error ? e.name : 'unknown',
    );
  }
}

/** Fire after the response. Falls back to a detached promise outside a request scope. */
export function queueBookingNotice(...args: Parameters<typeof sendBookingNotice>): void {
  try {
    after(() => sendBookingNotice(...args));
  } catch {
    void sendBookingNotice(...args);
  }
}
