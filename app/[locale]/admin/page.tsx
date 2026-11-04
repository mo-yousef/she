import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/admin-session';
import { loadAdminMetrics } from '@/lib/admin-data';
import { FocusHeading } from '@/components/focus-heading';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: 'admin' }))('overview.title') };
}
export default async function AdminOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin`);
  const t = await getTranslations('admin');
  const s = await getTranslations('dashboard.status');
  const m = await loadAdminMetrics();
  const n = new Intl.NumberFormat(locale);
  const cards: [string, number, string?][] = [
    [t('overview.pending'), m.pendingApprovals, '/admin/businesses'],
    [t('overview.reports'), m.openReports, '/admin/reviews'],
    [t('overview.bookings7'), m.bookings7],
    [t('overview.bookings30'), m.bookings30],
    [t('overview.users30'), m.users30],
    ...(['DRAFT', 'PENDING', 'PUBLISHED', 'SUSPENDED'] as const).map((k): [string, number] => [t('overview.businessesIn', { status: s(k) }), m.status[k]]),
  ];
  return (
    <div className="space-y-6">
      <FocusHeading className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('overview.title')}</FocusHeading>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(([label, value, href]) => (
          <div key={label} className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
            <dt className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{label}</dt>
            <dd className="text-[length:var(--text-title1)] font-bold tabular-nums">
              {href ? (
                <Link href={href} locale={locale} className="underline-offset-2 hover:underline">
                  {n.format(value)}
                </Link>
              ) : (
                n.format(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
