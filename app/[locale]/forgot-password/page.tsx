import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ForgotPasswordForm } from '@/components/account/forgot-password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ERROR_KEYS = new Set(['EmailInvalid', 'RateLimited', 'ResetFailed']);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Request a password-reset email. */
export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('account');
  const sent = first(sp.sent) === '1';
  const errorParam = first(sp.error);
  const errorKey = errorParam ? (ERROR_KEYS.has(errorParam) ? errorParam : 'Default') : null;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('forgotTitle')}</h1>

      {sent ? (
        <section
          role="status"
          className="mt-6 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm"
        >
          <h2 className="text-[length:var(--text-headline)] font-semibold">{t('forgotSentTitle')}</h2>
          <p className="mt-1 text-[color:var(--label-secondary)]">{t('forgotSentBody')}</p>
          <Link href="/signin" locale={locale} className="mt-4 inline-flex min-h-11 items-center font-medium text-[color:var(--tint)]">
            {t('backToSignIn')}
          </Link>
        </section>
      ) : (
        <>
          <p className="mt-2 text-[color:var(--label-secondary)]">{t('forgotIntro')}</p>
          {errorKey ? (
            <p role="alert" className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
              {t(`error.${errorKey}`)}
            </p>
          ) : null}
          <div className="mt-6">
            <ForgotPasswordForm locale={locale} />
          </div>
          <p className="mt-6 text-center">
            <Link href="/signin" locale={locale} className="font-medium text-[color:var(--tint)]">
              {t('backToSignIn')}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
