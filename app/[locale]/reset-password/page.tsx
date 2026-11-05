import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ResetPasswordForm } from '@/components/account/reset-password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ERROR_KEYS = new Set(['PasswordTooShort', 'PasswordMismatch', 'ResetSessionExpired']);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Set a new password. Reached from the reset email via /auth/callback, which
 * establishes a short-lived recovery session before redirecting here.
 */
export default async function ResetPasswordPage({
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
  const done = first(sp.done) === '1';
  const errorParam = first(sp.error);
  const errorKey = errorParam ? (ERROR_KEYS.has(errorParam) ? errorParam : 'Default') : null;

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 pb-24 pt-10">
        <section role="status" className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
          <h1 className="text-[length:var(--text-title2)] font-semibold">{t('resetDoneTitle')}</h1>
          <p className="mt-1 text-[color:var(--label-secondary)]">{t('resetDoneBody')}</p>
          <Link href="/signin" locale={locale} className="mt-4 inline-flex min-h-11 items-center font-medium text-[color:var(--tint)]">
            {t('backToSignIn')}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('resetTitle')}</h1>
      <p className="mt-2 text-[color:var(--label-secondary)]">{t('resetIntro')}</p>

      {errorKey ? (
        <p role="alert" className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
          {t(`error.${errorKey}`)}
        </p>
      ) : null}

      <div className="mt-6">
        <ResetPasswordForm locale={locale} />
      </div>
    </div>
  );
}
