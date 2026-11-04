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
    <div
      data-app-shell
      className="mx-auto flex max-w-7xl flex-col gap-5 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:flex-row lg:gap-10 lg:pb-12 lg:pt-8"
    >
      <aside className="lg:sticky lg:top-24 lg:w-64 lg:flex-none lg:self-start">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4 shadow-sm lg:mb-6">
          <span
            aria-hidden
            className="flex h-12 w-12 flex-none items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--tint)] text-[length:var(--text-title3)] font-bold text-[color:var(--tint-contrast)]"
          >
            {business.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-[length:var(--text-headline)] font-semibold leading-tight">{business.name}</p>
            <BusinessStatusBadge status={business.status} />
          </div>
          {business.status === 'PUBLISHED' ? (
            <Link
              href={`/b/${business.slug}`}
              locale={locale}
              aria-label={t('viewPublicPage')}
              className="press flex h-11 w-11 flex-none items-center justify-center rounded-full text-[color:var(--tint)] hover:bg-[color:var(--separator)]"
            >
              <ExternalLink className="h-5 w-5" aria-hidden />
            </Link>
          ) : null}
        </div>
        <DashboardNav locale={locale} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
