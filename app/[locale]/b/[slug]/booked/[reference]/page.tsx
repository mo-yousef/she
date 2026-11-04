import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarPlus, CheckCircle2, Hourglass, MessageCircle, Phone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { loadConfirmedBooking, isActiveStatus } from '@/lib/booking-confirmation';
import { bookingCalendarText } from '@/lib/booking-calendar-text';
import { buildGoogleCalendarUrl, buildWhatsAppShareUrl } from '@/lib/ics';
import { formatSlot } from '@/lib/format-datetime';
import { CopyReferenceButton } from '@/components/copy-reference-button';
import { FocusHeading } from '@/components/focus-heading';
import { BookingSummary } from '@/components/booking/booking-summary';

/**
 * Booking confirmation (requirement 3.2). PII surface: not indexed, never cached,
 * and Referrer-Policy: no-referrer so the `t` token in the URL never reaches a
 * third party via the Referer header on outbound links.
 *
 * Manage route (task 4.5, same token): /b/{slug}/manage/{reference}?t={token}
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booked' });
  return {
    title: t('pageTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function BookedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string; reference: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale, slug, reference } = await params;
  const { t: token } = await searchParams;
  setRequestLocale(locale);

  const booking = await loadConfirmedBooking({ slug, reference, token });
  if (!booking) notFound();

  const t = await getTranslations('booked');
  const c = await getTranslations('common');
  const active = isActiveStatus(booking.status);
  const confirmed = booking.status === 'CONFIRMED';

  const calendarText = bookingCalendarText(booking, t);
  const googleUrl = active
    ? buildGoogleCalendarUrl({
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        ...calendarText,
      })
    : null;
  const icsUrl = active
    ? `/b/${slug}/booked/${reference}/calendar.ics?t=${encodeURIComponent(token ?? '')}`
    : null;
  const whatsAppUrl = active
    ? buildWhatsAppShareUrl(
        t('shareMessage', {
          service: booking.service.name,
          business: booking.business.name,
          when: formatSlot(booking.startsAt.toISOString(), locale),
          reference: booking.reference,
        }),
      )
    : null;
  const manageUrl = `/b/${slug}/manage/${reference}?t=${encodeURIComponent(token ?? '')}`;

  return (
    <div
      className="brand-scope mx-auto max-w-2xl px-4 py-10"
      style={{ '--b1': booking.business.brandPrimary, '--b2': booking.business.brandAccent } as CSSProperties}
    >
      <div role="status" aria-live="polite" className="flex flex-col items-center text-center">
        {confirmed ? (
          <CheckCircle2 className="h-12 w-12 text-[color:var(--success)]" aria-hidden />
        ) : (
          <Hourglass className="h-12 w-12 text-[color:var(--b1-text)]" aria-hidden />
        )}
        <FocusHeading className="mt-3 text-[length:var(--text-title1)] font-bold">
          {confirmed ? t('headingConfirmed') : t('headingPending')}
        </FocusHeading>
        <p className="mt-1 text-[color:var(--label-secondary)]">
          {confirmed ? t('statusConfirmed') : active ? t('statusPending') : t('statusInactive')}
        </p>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 text-center shadow-sm">
        <span className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
          {t('referenceLabel')}
        </span>
        <span className="text-[length:var(--text-title1)] font-bold tracking-wider tabular-nums">
          {booking.reference}
        </span>
        <CopyReferenceButton reference={booking.reference} label={t('copyReference')} copiedLabel={t('copied')} />
      </div>

      <div className="mt-6">
        <BookingSummary booking={booking} locale={locale} />
      </div>

      {active ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-[length:var(--text-headline)] font-semibold">{t('addToCalendar')}</h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={googleUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-4 text-[length:var(--text-footnote)] font-medium"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              {t('googleCalendar')}
              <span className="sr-only"> ({t('externalLink')})</span>
            </a>
            <a
              href={icsUrl!}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-4 text-[length:var(--text-footnote)] font-medium"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              {t('downloadIcs')}
            </a>
          </div>

          <h2 className="pt-2 text-[length:var(--text-headline)] font-semibold">{t('shareWhatsApp')}</h2>
          <a
            href={whatsAppUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] bg-[color:var(--b1)] px-4 text-[length:var(--text-footnote)] font-semibold text-[color:var(--b1-contrast)]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {t('shareWhatsApp')}
            <span className="sr-only"> ({t('externalLink')})</span>
          </a>
        </div>
      ) : null}

      <div className="mt-8 border-t border-[color:var(--separator)] pt-6">
        <Link
          href={manageUrl}
          locale={locale}
          className="inline-flex min-h-11 items-center text-[length:var(--text-footnote)] font-semibold text-[color:var(--b1-text)] underline underline-offset-2"
        >
          {t('manageBooking')}
        </Link>
        <p className="mt-1 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('manageHint')}</p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[color:var(--separator)] pt-6">
        {booking.business.phone ? (
          <a
            href={`tel:${booking.business.phone}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-footnote)] font-medium"
          >
            <Phone className="h-4 w-4" aria-hidden />
            {c('call')}
          </a>
        ) : null}
        <Link
          href={`/b/${slug}`}
          locale={locale}
          className="inline-flex min-h-11 items-center text-[length:var(--text-footnote)] font-medium text-[color:var(--b1-text)] underline underline-offset-2"
        >
          {t('backToBusiness', { name: booking.business.name })}
        </Link>
      </div>
    </div>
  );
}
