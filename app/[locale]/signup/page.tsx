import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { safeCallbackPath } from '@/lib/callback-url';
import { SignUpForm } from '@/components/account/sign-up-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ERROR_KEYS = new Set([
  'NameRequired',
  'EmailInvalid',
  'PasswordTooShort',
  'PasswordMismatch',
  'EmailTaken',
  'SignUpFailed',
  'RateLimited',
]);

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Customer sign-up (name, email, password). Role becomes CUSTOMER. */
export default async function SignUpPage({
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

  const session = await auth();
  if (session?.user?.id) redirect(callback);

  const t = await getTranslations('account');
  const errorParam = first(sp.error);
  const errorKey = errorParam ? (ERROR_KEYS.has(errorParam) ? errorParam : 'Default') : null;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('signUpTitle')}</h1>
      <p className="mt-2 text-[color:var(--label-secondary)]">{t('signUpIntro')}</p>

      {errorKey ? (
        <p
          role="alert"
          className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]"
        >
          {t(`error.${errorKey}`)}
        </p>
      ) : null}

      <div className="mt-6">
        <SignUpForm
          locale={locale}
          callback={callback}
          variant="customer"
          googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'}
        />
      </div>

      <p className="mt-6 text-center text-[color:var(--label-secondary)]">
        {t('haveAccount')}{' '}
        <Link
          href={{ pathname: '/signin', query: { callbackUrl: callback } }}
          locale={locale}
          className="font-medium text-[color:var(--tint)]"
        >
          {t('signInSubmit')}
        </Link>
      </p>
      <p className="mt-2 text-center text-[length:var(--text-footnote)]">
        <Link href="/signup/business" locale={locale} className="text-[color:var(--tint)]">
          {t('listBusiness')}
        </Link>
      </p>
    </div>
  );
}
