import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/admin-session';
// Private surface: never indexed (robots.ts disallows it too).
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const NAV = [
  ['/admin', 'overview'],
  ['/admin/businesses', 'businesses'],
  ['/admin/reviews', 'reviews'],
  ['/admin/users', 'users'],
] as const;
/** Admin shell (task 7.1). Role-gated from the DB: signed-out -> sign-in, non-admin -> 404. */
export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin`);
  const t = await getTranslations('admin.nav');
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-24 pt-6">
      <nav aria-label={t('label')}>
        <ul className="flex flex-wrap gap-1">
          {NAV.map(([href, key]) => (
            <li key={href}>
              <Link href={href} locale={locale} className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] px-4 font-medium hover:bg-[color:var(--separator)]">
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
