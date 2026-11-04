/**
 * GDPR pure policy (req 9, task 7.2): constants, retention cutoffs, the anonymisation mapping
 * and the data-export builder. No DB access here; the DB side is lib/gdpr-server.ts.
 */

/** Version of the privacy policy/terms shown at the booking consent step. Bump on a text change. */
export const CONSENT_VERSION = '2026-11';

export const PHONE_VERIFICATION_RETENTION_DAYS = 7;
export const NOTIFICATION_LOG_RETENTION_MONTHS = 24;
/** Guest PII on a booking is anonymised this long after the appointment ended. */
export const BOOKING_PII_RETENTION_MONTHS = 24;
/** Max rows touched per table per cron run; the next daily run continues. */
export const RETENTION_BATCH = 1000;

export const DELETED_USER_NAME = 'Deleted user';
export const FORMER_CUSTOMER_NAME = 'Former customer';

const DAY_MS = 86_400_000;

/** Calendar-month subtraction in UTC (day clamped so 31 March - 1 month = 28/29 Feb). */
function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export interface RetentionCutoffs {
  phoneVerificationBefore: Date;
  notificationLogBefore: Date;
  bookingEndedBefore: Date;
}

export function retentionCutoffs(now: Date): RetentionCutoffs {
  return {
    phoneVerificationBefore: new Date(now.getTime() - PHONE_VERIFICATION_RETENTION_DAYS * DAY_MS),
    notificationLogBefore: monthsAgo(now, NOTIFICATION_LOG_RETENTION_MONTHS),
    bookingEndedBefore: monthsAgo(now, BOOKING_PII_RETENTION_MONTHS),
  };
}

/** Booking columns that hold customer PII, as they are after anonymisation. */
export const ANONYMISED_BOOKING = {
  guestName: DELETED_USER_NAME,
  guestEmail: null,
  guestPhone: null,
  note: null,
  customerId: null,
} as const;

/** Review columns after the author asks for erasure: rating stays so aggregates stay valid. */
export const ANONYMISED_REVIEW = { authorName: FORMER_CUSTOMER_NAME, body: null } as const;

// ---- Export ----

export interface ExportRows {
  user: {
    name: string | null;
    email: string | null;
    phone: string | null;
    locale: string;
    role: string;
    createdAt: Date;
  };
  bookings: Array<{
    reference: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    priceCents: number;
    note: string | null;
    guestName: string | null;
    guestEmail: string | null;
    guestPhone: string | null;
    consentTermsAt: Date | null;
    consentMessagesAt: Date | null;
    consentVersion: string | null;
    business: { name: string; slug: string };
    service: { name: string };
    staff: { name: string };
    review: { rating: number; body: string | null; authorName: string; createdAt: Date; ownerReply: string | null } | null;
  }>;
  favourites: Array<{ business: { name: string; slug: string } }>;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Whitelist builder: only fields listed here can leave the system (no ids, hashes, tokens). */
export function buildExport(rows: ExportRows, now: Date = new Date()) {
  return {
    exportedAt: now.toISOString(),
    profile: {
      name: rows.user.name,
      email: rows.user.email,
      phone: rows.user.phone,
      locale: rows.user.locale,
      role: rows.user.role,
      createdAt: iso(rows.user.createdAt),
    },
    bookings: rows.bookings.map((b) => ({
      reference: b.reference,
      business: b.business.name,
      businessSlug: b.business.slug,
      service: b.service.name,
      staff: b.staff.name,
      startsAt: iso(b.startsAt),
      endsAt: iso(b.endsAt),
      status: b.status,
      priceCents: b.priceCents,
      currency: 'EUR',
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      guestPhone: b.guestPhone,
      note: b.note,
      consents: {
        terms: iso(b.consentTermsAt),
        messages: iso(b.consentMessagesAt),
        policyVersion: b.consentVersion,
      },
    })),
    reviews: rows.bookings.flatMap((b) =>
      b.review
        ? [
            {
              bookingReference: b.reference,
              business: b.business.name,
              rating: b.review.rating,
              body: b.review.body,
              authorName: b.review.authorName,
              ownerReply: b.review.ownerReply,
              createdAt: iso(b.review.createdAt),
            },
          ]
        : [],
    ),
    favourites: rows.favourites.map((f) => ({ business: f.business.name, slug: f.business.slug })),
  };
}
