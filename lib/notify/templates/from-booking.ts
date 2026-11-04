import type { NotifyLocale } from '../types';
import { DEFAULT_BRAND } from './content';
import type { Audience, BookingTemplateData } from './types';

const LOCALES: readonly NotifyLocale[] = ['en', 'el', 'ru'];

/** Anything unknown falls back to English rather than failing a send. */
export function toNotifyLocale(value: string | null | undefined): NotifyLocale {
  return LOCALES.includes(value as NotifyLocale) ? (value as NotifyLocale) : 'en';
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Structural inputs (DB rows satisfy these; no Prisma types needed). */
export interface BookingRows {
  booking: {
    reference: string;
    status: string;
    startsAt: Date;
    priceCents: number;
    guestName: string | null;
    guestPhone: string | null;
    guestEmail: string | null;
    note: string | null;
  };
  business: { name: string; slug: string; address: string | null; city: string; brandPrimary: string | null };
  service: { name: string; durationMin: number };
  staff: { name: string };
}

/**
 * Maps DB rows to template data. `locale` is the RECIPIENT's: pass Booking.locale for
 * customer messages and the owner's User.locale for business messages.
 */
export function bookingToTemplateData(
  rows: BookingRows,
  opts: {
    audience: Audience;
    locale: NotifyLocale;
    /** Customer links only. Pass null for business messages. */
    manageToken: string | null;
    previousStartsAt?: Date;
    siteUrl?: string;
  },
): BookingTemplateData {
  const { booking, business, service, staff } = rows;
  return {
    audience: opts.audience,
    locale: opts.locale,
    siteUrl: opts.siteUrl ?? siteUrl(),
    reference: booking.reference,
    pending: booking.status === 'PENDING',
    business: {
      name: business.name,
      slug: business.slug,
      address: [business.address, business.city].filter(Boolean).join(', ') || null,
      brandColour: DEFAULT_BRAND,
    },
    serviceName: service.name,
    staffName: staff.name,
    startsAt: booking.startsAt.toISOString(),
    previousStartsAt: opts.previousStartsAt?.toISOString(),
    durationMin: service.durationMin,
    priceCents: booking.priceCents,
    customer: {
      name: booking.guestName,
      phone: booking.guestPhone,
      email: booking.guestEmail,
      note: booking.note,
    },
    manageToken: opts.manageToken,
  };
}
