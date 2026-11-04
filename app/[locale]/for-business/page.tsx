import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * Owner landing page: explains listing, then sends people into sign-in -> onboarding.
 * The onboarding route itself redirects signed-out visitors to sign-in with a callbackUrl.
 */
export default async function ForBusinessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('forBusiness');
  const points = ['pointBookings', 'pointPage', 'pointTools'] as const;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-16">
      <h1 className="text-center text-[length:var(--text-large-title)] font-bold tracking-tight">{t('title')}</h1>
      <p className="mx-auto mt-4 max-w-[55ch] text-center text-[color:var(--label-secondary)]">{t('intro')}</p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {points.map((p) => (
          <li key={p} className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
            <h2 className="text-[length:var(--text-headline)] font-semibold">{t(`${p}Title`)}</h2>
            <p className="mt-1 text-[color:var(--label-secondary)]">{t(`${p}Body`)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-col items-center gap-3">
        <Link
          href="/onboarding?step=basics"
          locale={locale}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 font-semibold text-[color:var(--tint-contrast)]"
        >
          {t('cta')}
        </Link>
        <Link
          href={{ pathname: '/account', query: { callbackUrl: `/${locale}/dashboard` } }}
          locale={locale}
          className="inline-flex min-h-11 items-center text-[color:var(--tint)]"
        >
          {t('haveAccount')}
        </Link>
      </div>
    </div>
  );
}
