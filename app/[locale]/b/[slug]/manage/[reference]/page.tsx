import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, Hourglass, UserX, XCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { loadConfirmedBooking } from '@/lib/booking-confirmation';
import { loadAvailabilityInput } from '@/lib/booking-availability';
import { computeAvailability } from '@/lib/availability';
import { buildDayGrid, dayWindows } from '@/lib/slot-grid';
import { isChangeableStatus, withinChangeWindow } from '@/lib/manage-policy';
import { parseSettings } from '@/lib/settings';
import { CopyReferenceButton } from '@/components/copy-reference-button';
import { FocusHeading } from '@/components/focus-heading';
import { BookingSummary } from '@/components/booking/booking-summary';
import { ContactLinks } from '@/components/manage/contact-links';
import { ManageActions } from '@/components/manage/manage-actions';
import { ReschedulePicker, type RescheduleDay } from '@/components/manage/reschedule-picker';

/**
 * Manage booking (requirement 3.2): view, reschedule, cancel via the signed token.
 * Same hardening as the confirmation page: every failure is one bare 404 (no
 * hint whether a reference exists), noindex, never cached, no-referrer so the
 * `t` token never leaks through the Referer header. Actions re-check the token
 * and the policy themselves (app/actions/manage-booking.ts); what this page
 * decides is only what to SHOW.
 */
export const dynamic = 'force-dynamic';

/** How many days the reschedule picker offers (capped by the business's own max advance). */
const RESCHEDULE_DAYS = 30;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'manage' });
  return {
    title: t('pageTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

const STATUS_KEY = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED_BY_CUSTOMER: 'cancelledByCustomer',
  CANCELLED_BY_BUSINESS: 'cancelledByBusiness',
  NO_SHOW: 'noShow',
} as const;

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string; reference: string }>;
  searchParams: Promise<{ t?: string; reschedule?: string; done?: string }>;
}) {
  const { locale, slug, reference } = await params;
  const { t: token, reschedule, done } = await searchParams;
  setRequestLocale(locale);

  const booking = await loadConfirmedBooking({ slug, reference, token });
  if (!booking || !token) notFound();

  const t = await getTranslations('manage');
  const changeable = isChangeableStatus(booking.status);
  const settings = parseSettings(booking.business.settings);
  const canChange = changeable && withinChangeWindow(new Date(), booking.startsAt, settings.cancellationWindowHours);
  const statusKey = STATUS_KEY[booking.status as keyof typeof STATUS_KEY];
  const manageHref = `/b/${slug}/manage/${reference}`;
  const tokenQs = `t=${encodeURIComponent(token)}`;
  const { phone, whatsapp } = booking.business;

  // Reschedule view: fresh availability for the SAME service + staff, own slot freed.
  let rescheduleDays: RescheduleDay[] | null = null;
  if (reschedule === '1' && canChange && booking.business.status === 'PUBLISHED') {
    const loaded = await loadAvailabilityInput({
      businessId: booking.businessId,
      serviceId: booking.serviceId,
      staffId: booking.staffId,
      days: Math.min(RESCHEDULE_DAYS, settings.maxAdvanceDays),
      excludeBookingId: booking.id,
    });
    if (loaded) {
      const { input } = loaded;
      const scope = input.staffId ? input.staff.filter((s) => s.id === input.staffId) : input.staff;
      rescheduleDays = computeAvailability(input).map((d) => {
        const grid = buildDayGrid({
          dateKey: d.dateKey,
          windows: dayWindows({
            dateKey: d.dateKey,
            openingHours: input.openingHours,
            staffHours: scope.map((s) => s.hours),
            staffDaysOff: scope.map((s) => s.daysOff),
            closures: input.closures,
          }),
          durationMin: input.service.durationMin,
          bufferMin: input.service.bufferMin ?? input.settings.bufferMin,
          stepMin: input.settings.slotIntervalMin,
          available: d.slots.map((s) => s.startsAt),
        });
        return {
          dateKey: d.dateKey,
          hasAvailability: d.slots.length > 0,
          slots: grid.map((g) => ({ startsAt: g.startsAt.toISOString(), available: g.available })),
        };
      });
    }
  }
  const rescheduling = rescheduleDays !== null;

  const StatusIcon =
    booking.status === 'CONFIRMED' || booking.status === 'COMPLETED'
      ? CheckCircle2
      : booking.status === 'PENDING'
        ? Hourglass
        : booking.status === 'NO_SHOW'
          ? UserX
          : XCircle;

  return (
    <div
      className="brand-scope mx-auto max-w-2xl px-4 py-10"
      style={{ '--b1': booking.business.brandPrimary, '--b2': booking.business.brandAccent } as CSSProperties}
    >
      <div role="status" aria-live="polite" className="flex flex-col items-center text-center">
        <StatusIcon className="h-12 w-12 text-[color:var(--b1-text)]" aria-hidden />
        {/* key: remounting on a status change moves focus to the new heading (e.g. after cancelling). */}
        <FocusHeading key={booking.status} className="mt-3 text-[length:var(--text-title1)] font-bold">
          {rescheduling ? t('rescheduleHeading') : changeable ? t('heading') : t(`heading_${statusKey}`)}
        </FocusHeading>
        {done === 'rescheduled' && !rescheduling && changeable ? (
          <p className="mt-2 font-medium text-[color:var(--success)]">{t('rescheduled')}</p>
        ) : null}
        <p className="mt-1 text-[color:var(--label-secondary)]">
          <span className="font-medium">{t('statusLabel')}</span> {t(`status.${statusKey}`)}
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

      <div className="mt-6">
        {rescheduling ? (
          <ReschedulePicker
            locale={locale}
            slug={slug}
            reference={reference}
            token={token}
            manageHref={manageHref}
            days={rescheduleDays!}
            phone={phone}
            whatsapp={whatsapp}
          />
        ) : changeable ? (
          <>
            <ManageActions
              locale={locale}
              slug={slug}
              reference={reference}
              token={token}
              rescheduleHref={`${manageHref}?${tokenQs}&reschedule=1`}
              canChange={canChange}
              phone={phone}
              whatsapp={whatsapp}
            />
            {canChange ? (
              <p className="mt-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                {t('policyHint', { hours: settings.cancellationWindowHours })}
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4 shadow-sm">
            <p className="text-[length:var(--text-subhead)]">{t(`readOnly_${statusKey}`)}</p>
            <div className="mt-3">
              <ContactLinks phone={phone} whatsapp={whatsapp} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-[color:var(--separator)] pt-6">
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
