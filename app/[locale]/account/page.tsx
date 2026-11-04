import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { localeOfPath, safeCallbackPath } from '@/lib/callback-url';
import { DeleteAccount } from '@/components/account/delete-account';
import { db } from '@/lib/db';
import { signInWithEmailAction, signInWithGoogleAction, signOutAction } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ERROR_KEYS = new Set([
  'EmailInvalid',
  'EmailSignin',
  'RateLimited',
  'Verification',
  'AccessDenied',
  'Configuration',
  'OAuthAccountNotLinked',
]);

const inputClass =
  'min-h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)]';
const primaryButton =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 font-semibold text-[color:var(--tint-contrast)]';
const secondaryButton =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-5 font-semibold text-[color:var(--label)]';

/**
 * Account page: sign-in when signed out, account home when signed in. It is built as a stack
 * of <section>s with the GDPR data-export and delete sections (task 7.2) below "You".
 */
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const callback = safeCallbackPath(first(sp.callbackUrl), `/${locale}/account`);

  // Auth.js sends people to the static /en/account; forward to the locale they were using.
  const callbackLocale = localeOfPath(callback);
  if (callbackLocale && callbackLocale !== locale) {
    const qs = new URLSearchParams();
    for (const key of ['callbackUrl', 'error', 'sent']) {
      const v = first(sp[key]);
      if (v) qs.set(key, v);
    }
    redirect(`/${callbackLocale}/account?${qs}`);
  }

  const t = await getTranslations('account');
  const session = await auth();
  const errorParam = first(sp.error);
  const errorKey = errorParam ? (ERROR_KEYS.has(errorParam) ? errorParam : 'Default') : null;

  if (session?.user?.id) {
    const isOwner = session.user.role === 'OWNER' || session.user.role === 'ADMIN';
    const ownedBusinesses = await db.business.count({ where: { ownerId: session.user.id } });
    return (
      <div className="mx-auto max-w-xl px-4 pb-24 pt-10">
        <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</h1>
        <section aria-labelledby="account-you" className="mt-6 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
          <h2 id="account-you" className="text-[length:var(--text-headline)] font-semibold">
            {t('youHeading')}
          </h2>
          <p className="mt-1 break-words text-[color:var(--label-secondary)]">
            {t('signedInAs', { email: session.user.email ?? '' })}
          </p>
          <ul className="mt-4 divide-y divide-[color:var(--separator)]">
            {isOwner ? (
              <li>
                <Link href="/dashboard" locale={locale} className="flex min-h-11 items-center font-medium text-[color:var(--tint)]">
                  {t('openDashboard')}
                </Link>
              </li>
            ) : (
              <li>
                <Link href="/for-business" locale={locale} className="flex min-h-11 items-center font-medium text-[color:var(--tint)]">
                  {t('listBusiness')}
                </Link>
              </li>
            )}
            <li>
              <Link href="/favourites" locale={locale} className="flex min-h-11 items-center font-medium text-[color:var(--tint)]">
                {t('favourites')}
              </Link>
            </li>
          </ul>
          <form action={signOutAction} className="mt-4">
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={secondaryButton}>
              {t('signOut')}
            </button>
          </form>
        </section>
        <section aria-labelledby="account-data" className="mt-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
          <h2 id="account-data" className="text-[length:var(--text-headline)] font-semibold">
            {t('data.heading')}
          </h2>
          <p className="mt-1 text-[color:var(--label-secondary)]">{t('data.body')}</p>
          <a href="/api/account/export" download="she-cy-data.json" className={`${secondaryButton} mt-4`}>
            {t('data.download')}
          </a>
          <p className="mt-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
            <Link href="/legal/privacy" locale={locale} className="inline-flex min-h-11 items-center text-[color:var(--tint)]">
              {t('data.privacy')}
            </Link>
          </p>
        </section>
        <section aria-labelledby="account-delete" className="mt-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
          <h2 id="account-delete" className="text-[length:var(--text-headline)] font-semibold">
            {t('delete.heading')}
          </h2>
          <DeleteAccount locale={locale} email={session.user.email ?? ''} ownsBusiness={ownedBusinesses > 0} />
        </section>
      </div>
    );
  }

  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const sent = first(sp.sent) === '1';

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('signInTitle')}</h1>
      <p className="mt-2 text-[color:var(--label-secondary)]">{t('signInIntro')}</p>
      {first(sp.deleted) === '1' ? (
        <p role="status" className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--control-border)] p-3">
          {t('delete.done')}
        </p>
      ) : null}

      {errorKey ? (
        <p role="alert" className="mt-5 rounded-[var(--radius-input)] border border-[color:var(--danger)] p-3 text-[color:var(--danger)]">
          {t(`error.${errorKey}`)}
        </p>
      ) : null}

      {sent ? (
        <section aria-labelledby="sent-title" role="status" className="mt-6 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
          <h2 id="sent-title" className="text-[length:var(--text-headline)] font-semibold">
            {t('sentTitle')}
          </h2>
          <p className="mt-1 text-[color:var(--label-secondary)]">{t('sentBody')}</p>
          <Link
            href={{ pathname: '/account', query: { callbackUrl: callback } }}
            locale={locale}
            className="mt-4 inline-flex min-h-11 items-center font-medium text-[color:var(--tint)]"
          >
            {t('useAnotherEmail')}
          </Link>
        </section>
      ) : (
        <div className="mt-6 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
          <form action={signInWithEmailAction} className="space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="callbackUrl" value={callback} />
            <label htmlFor="email" className="block text-[length:var(--text-subhead)] font-medium">
              {t('emailLabel')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              className={inputClass}
            />
            <button type="submit" className={primaryButton}>
              {t('emailSubmit')}
            </button>
          </form>

          {googleEnabled ? (
            <>
              <p className="my-4 text-center text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('or')}</p>
              <form action={signInWithGoogleAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="callbackUrl" value={callback} />
                <button type="submit" className={secondaryButton}>
                  {t('google')}
                </button>
              </form>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
