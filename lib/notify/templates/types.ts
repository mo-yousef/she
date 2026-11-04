import type { NotifyLocale } from '../types';

/** The seven message kinds. The kind doubles as the `template` name on EmailMessage/PhoneMessage. */
export type TemplateKind =
  | 'booking-confirmed' // customer: confirmed, or "request received" when `pending`
  | 'booking-new-business' // business owner: a new booking / request arrived
  | 'booking-rescheduled' // customer or business (see `audience`)
  | 'booking-cancelled' // customer or business (see `audience`)
  | 'reminder-24h'
  | 'reminder-2h'
  | 'review-request';

export type Audience = 'customer' | 'business';

/**
 * Plain, serialisable template input. No Prisma types, no Dates (ISO strings), so
 * cron jobs and tests can build it without a database.
 */
export interface BookingTemplateData {
  /** Who receives the message. Customer copy never shows other people's contact details. */
  audience: Audience;
  /** Recipient's locale: Booking.locale for customers, the owner's User.locale for the business. */
  locale: NotifyLocale;
  /** Absolute site origin without trailing slash, e.g. https://she.cy */
  siteUrl: string;
  reference: string;
  /** Booking is PENDING: "request received" wording instead of "confirmed". */
  pending: boolean;
  business: {
    name: string;
    slug: string;
    /** One display line, e.g. "12 Ledra St, Nicosia". */
    address: string | null;
    /** `#rrggbb`. Only used for a small accent bar, never for text contrast. */
    brandColour: string;
  };
  serviceName: string;
  staffName: string;
  /** ISO instants (UTC). Formatted in Europe/Nicosia at render time. */
  startsAt: string;
  /** Rescheduled notices: the time it moved from. */
  previousStartsAt?: string;
  durationMin: number;
  priceCents: number;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
    note: string | null;
  };
  /**
   * Raw manage token for the customer's own link, or null to omit links (business copy,
   * or when the token could not be rebuilt). Same token is used for the review link.
   */
  manageToken: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
