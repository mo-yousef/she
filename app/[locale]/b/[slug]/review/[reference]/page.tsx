import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, Hourglass, Clock } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { formatDate } from '@/lib/format-datetime';
import { maskPhone } from '@/lib/review-otp';
import { REVIEW_WINDOW_DAYS } from '@/lib/review-schema';
import { loadReviewBooking, phoneAlreadyVerified, reviewEligibility } from '@/lib/review-submit';
import { FocusHeading } from '@/components/focus-heading';
import { ReviewForm } from '@/components/reviews/review-form';

/**
 * Review request landing page (task 5.5, req 2.2 + 7). Route contract fixed in 5.2:
 * `/{locale}/b/{slug}/review/{reference}?t={manageToken}`. A bad token or unknown
 * reference is one bare 404 (no hint whether a reference exists). Once the token
 * verifies, state-specific messages are fine. noindex, never cached, no-referrer so the
 * token never leaks via the Referer header. The server action re-checks everything.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'review' });
  return { title: t('pageTitle'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string; reference: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale, slug, reference } = await params;
  const { t: token } = await searchParams;
  setRequestLocale(locale);

  const booking = await loadReviewBooking({ businessSlug: slug, reference, token });
  if (!booking || !token) notFound();

  const t = await getTranslations('review');
  const state = reviewEligibility(booking, new Date());
  const { name } = booking.business;
  const summary = t('summary', {
    service: booking.service.name,
    staff: booking.staff.name,
    date: formatDate(booking.startsAt.toISOString(), locale),
  });

  let content: React.ReactNode;
  if (state === 'ELIGIBLE') {
    const session = await auth();
    const verified = await phoneAlreadyVerified(session?.user?.id ?? null, booking);
    content = (
      <>
        <div className="text-center">
          <FocusHeading className="text-[length:var(--text-title1)] font-bold">{t('heading')}</FocusHeading>
          <p className="mt-1 text-[color:var(--label-secondary)]">{name}</p>
          <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{summary}</p>
        </div>
        <div className="mt-6">
          <ReviewForm
            slug={slug}
            reference={reference}
            token={token}
            businessName={name}
            maskedPhone={booking.guestPhone ? maskPhone(booking.guestPhone) : ''}
            needsOtp={!verified}
          />
        </div>
      </>
    );
  } else {
    const Icon = state === 'ALREADY_REVIEWED' ? CheckCircle2 : state === 'NOT_COMPLETED' ? Hourglass : Clock;
    const heading = {
      ALREADY_REVIEWED: t('alreadyHeading'),
      NOT_COMPLETED: t('notCompletedHeading'),
      WINDOW_PASSED: t('expiredHeading'),
    }[state];
    const body = {
      ALREADY_REVIEWED: t('alreadyBody'),
      NOT_COMPLETED: t('notCompletedBody', { business: name }),
      WINDOW_PASSED: t('expiredBody', { days: REVIEW_WINDOW_DAYS }),
    }[state];
    content = (
      <div role="status" className="flex flex-col items-center text-center">
        <Icon className="h-12 w-12 text-[color:var(--b1-text)]" aria-hidden />
        <FocusHeading className="mt-3 text-[length:var(--text-title1)] font-bold">{heading}</FocusHeading>
        <p className="mt-2 text-[color:var(--label-secondary)]">{body}</p>
        <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{summary}</p>
        {state === 'NOT_COMPLETED' ? (
          <Link
            href={`/b/${slug}/manage/${reference}?t=${encodeURIComponent(token)}`}
            className="mt-4 inline-flex min-h-11 items-center font-medium text-[color:var(--b1-text)] underline underline-offset-2"
          >
            {t('viewBooking')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="brand-scope mx-auto max-w-2xl px-4 py-10"
      style={{ '--b1': booking.business.brandPrimary, '--b2': booking.business.brandAccent } as CSSProperties}
    >
      {content}
      <div className="mt-8 border-t border-[color:var(--separator)] pt-6">
        <Link
          href={`/b/${slug}`}
          className="inline-flex min-h-11 items-center text-[length:var(--text-footnote)] font-medium text-[color:var(--b1-text)] underline underline-offset-2"
        >
          {t('backToBusiness', { name })}
        </Link>
      </div>
    </div>
  );
}
