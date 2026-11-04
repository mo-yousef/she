import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { DashboardNav } from '@/components/dashboard-nav';
import { BusinessStatusBadge } from '@/components/business-status-badge';

// Private surface: never indexed (robots.ts disallows it too).
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Owner dashboard shell (task 6.1). Role-gated on the server: signed-out users go to
 * sign-in with a callbackUrl, non-owners to the owner landing page, owners without a
 * business to onboarding. Platform chrome stays neutral (no per-business brand colour).
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard`);
  const t = await getTranslations('dashboard');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-24 pt-6 lg:flex-row lg:gap-10">
      <aside className="lg:w-64 lg:flex-none">
        <div className="mb-4">
          <p className="break-words text-[length:var(--text-headline)] font-semibold">{business.name}</p>
          <BusinessStatusBadge status={business.status} />
          {business.status === 'PUBLISHED' ? (
            <Link
              href={`/b/${business.slug}`}
              locale={locale}
              className="mt-1 flex min-h-11 items-center gap-1.5 text-[color:var(--tint)] underline-offset-2 hover:underline"
            >
              {t('viewPublicPage')}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
        <DashboardNav locale={locale} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
