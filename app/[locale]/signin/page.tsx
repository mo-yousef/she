import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { localeOfPath, safeCallbackPath } from '@/lib/callback-url';
import { SignInForm } from '@/components/account/sign-in-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ERROR_KEYS = new Set([
  'EmailInvalid',
  'InvalidCredentials',
  'EmailNotConfirmed',
  'RateLimited',
  'AccessDenied',
  'Configuration',
  'OAuthAccountNotLinked',
  'OAuthSignin',
]);

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Sign-in page (email + password). Signed-out visitors land here; already
 * signed-in visitors are forwarded to the account home honouring callbackUrl.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const callback = safeCallbackPath(first(sp.callbackUrl), `/${locale}/account`);

  const callbackLocale = localeOfPath(callback);
  if (callbackLocale && callbackLocale !== locale) {
    const qs = new URLSearchParams();
    for (const key of ['callbackUrl', 'error', 'pending']) {
      const v = first(sp[key]);
      if (v) qs.set(key, v);
    }
    redirect(`/${callbackLocale}/signin?${qs}`);
  }

  const session = await auth();
  if (session?.user?.id) redirect(callback);

  const t = await getTranslations('account');
  const errorParam = first(sp.error);
  const errorKey = errorParam ? (ERROR_KEYS.has(errorParam) ? errorParam : 'Default') : null;
  const pending = first(sp.pending) === '1';

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('signInTitle')}</h1>
      <p className="mt-2 text-[color:var(--label-secondary)]">{t('signInIntro')}</p>

      {pending ? (
        <p
          role="status"
          className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--control-border)] p-3 text-[color:var(--label-secondary)]"
        >
          {t('error.EmailNotConfirmed')}
        </p>
      ) : null}

      {errorKey ? (
        <p
          role="alert"
          className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
        >
          {t(`error.${errorKey}`)}
        </p>
      ) : null}

      <div className="mt-6">
        <SignInForm
          locale={locale}
          callback={callback}
          googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'}
        />
      </div>

      <p className="mt-6 text-center text-[color:var(--label-secondary)]">
        {t('noAccount')}{' '}
        <Link
          href={{ pathname: '/signup', query: { callbackUrl: callback } }}
          locale={locale}
          className="font-medium text-[color:var(--tint)]"
        >
          {t('createAccount')}
        </Link>
      </p>
    </div>
  );
}
