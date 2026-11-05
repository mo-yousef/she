import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { safeCallbackPath } from '@/lib/callback-url';
import { DeleteAccount } from '@/components/account/delete-account';
import { db } from '@/lib/db';
import { signOutAction } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const secondaryButton =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-5 font-semibold text-[color:var(--label)]';

/**
 * Account home (signed-in only). Signed-out visitors are forwarded to /signin.
 * A stack of <section> cards: "You", GDPR data export, and account deletion
 * (task 7.2).
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

  const session = await auth();

  // Signed-out visitors use the dedicated sign-in page.
  if (!session?.user?.id) {
    redirect(`/${locale}/signin?${new URLSearchParams({ callbackUrl: callback })}`);
  }

  const t = await getTranslations('account');
  const isOwner = session.user.role === 'OWNER' || session.user.role === 'ADMIN';
  const ownedBusinesses = await db.business.count({ where: { ownerId: session.user.id } });

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</h1>
      <section
        aria-labelledby="account-you"
        className="mt-6 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm"
      >
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
      <section
        aria-labelledby="account-data"
        className="mt-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm"
      >
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
      <section
        aria-labelledby="account-delete"
        className="mt-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm"
      >
        <h2 id="account-delete" className="text-[length:var(--text-headline)] font-semibold">
          {t('delete.heading')}
        </h2>
        <DeleteAccount locale={locale} email={session.user.email ?? ''} ownsBusiness={ownedBusinesses > 0} />
      </section>
    </div>
  );
}
