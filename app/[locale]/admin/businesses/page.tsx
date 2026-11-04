import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/admin-session';
import { loadAdminBusinesses } from '@/lib/admin-data';
import { BUSINESS_FILTERS, businessActionsFor, parseAdminBusinessParams } from '@/lib/admin-params';
import { BusinessStatusBadge } from '@/components/business-status-badge';
import { AdminAction } from '@/components/admin/admin-action';
import { Pager } from '@/components/admin/pager';
import { FocusHeading } from '@/components/focus-heading';
import { inputClass, primaryBtn } from '@/components/calendar/fields';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: 'admin' }))('businesses.title') };
}
export default async function AdminBusinesses({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/businesses`);
  const p = parseAdminBusinessParams(await searchParams);
  const t = await getTranslations('admin');
  const s = await getTranslations('dashboard.status');
  const { total, rows } = await loadAdminBusinesses(p);
  const href = (over: Partial<typeof p>) => {
    const v = { ...p, ...over };
    const qs = new URLSearchParams();
    if (v.status !== 'PENDING') qs.set('status', v.status);
    if (v.q) qs.set('q', v.q);
    if (v.page > 1) qs.set('page', String(v.page));
    return qs.size ? `/admin/businesses?${qs}` : '/admin/businesses';
  };
  return (
    <div className="space-y-6">
      <FocusHeading className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('businesses.title')}</FocusHeading>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-48 flex-1">
          <label htmlFor="ab-q" className="block text-[length:var(--text-subhead)] font-medium">{t('businesses.search')}</label>
          <input id="ab-q" name="q" defaultValue={p.q} maxLength={80} className={inputClass} />
        </div>
        <div>
          <label htmlFor="ab-status" className="block text-[length:var(--text-subhead)] font-medium">{t('businesses.status')}</label>
          <select id="ab-status" name="status" defaultValue={p.status} className={inputClass}>
            {BUSINESS_FILTERS.map((f) => (
              <option key={f} value={f}>{f === 'all' ? t('list.all') : s(f)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className={primaryBtn}>{t('list.apply')}</button>
      </form>
      <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]" aria-live="polite">{t('list.count', { count: total })}</p>
      {rows.length === 0 ? (
        <p>{t('businesses.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id} className="space-y-2 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words font-semibold">{b.name}</p>
                <BusinessStatusBadge status={b.status} />
              </div>
              <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                {b.slug}{b.city ? ` · ${b.city}` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {b.status === 'PUBLISHED' ? (
                  <Link href={`/b/${b.slug}`} locale={locale} className="inline-flex min-h-11 items-center px-2 text-[color:var(--tint)] underline-offset-2 hover:underline">{t('businesses.view')}</Link>
                ) : null}
                {businessActionsFor(b.status).map((a) => (
                  <AdminAction key={a} kind={{ type: 'business', id: b.id, action: a }} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={p.page} total={total} locale={locale} href={(page) => href({ page })} />
    </div>
  );
}
