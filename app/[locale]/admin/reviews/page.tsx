import { Flag, EyeOff, Eye } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/admin-session';
import { loadAdminReviews } from '@/lib/admin-data';
import { REVIEW_FILTERS, parseAdminReviewParams, reviewActionsFor } from '@/lib/admin-params';
import { REPORT_REASONS } from '@/lib/review-report';
import { AdminAction } from '@/components/admin/admin-action';
import { Pager } from '@/components/admin/pager';
import { FocusHeading } from '@/components/focus-heading';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: 'admin' }))('reviews.title') };
}
const STATUS_ICON = { FLAGGED: Flag, HIDDEN: EyeOff, VISIBLE: Eye } as const;
export default async function AdminReviews({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, `/${locale}/admin/reviews`);
  const p = parseAdminReviewParams(await searchParams);
  const t = await getTranslations('admin');
  const { total, rows } = await loadAdminReviews(p);
  const href = (filter: string, page = 1) => {
    const qs = new URLSearchParams();
    if (filter !== 'flagged') qs.set('filter', filter);
    if (page > 1) qs.set('page', String(page));
    return qs.size ? `/admin/reviews?${qs}` : '/admin/reviews';
  };
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (
    <div className="space-y-6">
      <FocusHeading className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('reviews.title')}</FocusHeading>
      <nav aria-label={t('reviews.filters')}>
        <ul className="flex flex-wrap gap-2">
          {REVIEW_FILTERS.map((f) => (
            <li key={f}>
              <Link href={href(f)} locale={locale} aria-current={p.filter === f ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--radius-button)] border px-4 font-medium ${p.filter === f ? 'border-[color:var(--tint)] bg-[color:var(--tint)] text-[color:var(--tint-contrast)]' : 'border-[color:var(--control-border)]'}`}>
                {t(`reviews.filter.${f}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]" aria-live="polite">{t('list.count', { count: total })}</p>
      {rows.length === 0 ? (
        <p>{t('reviews.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const Icon = STATUS_ICON[r.status];
            const reason = r.reason && (REPORT_REASONS as readonly string[]).includes(r.reason) ? r.reason : null;
            return (
              <li key={r.id} className="space-y-2 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{r.business.name}</p>
                  <span className="inline-flex items-center gap-1.5 text-[length:var(--text-subhead)] font-medium">
                    <Icon className="h-4 w-4" aria-hidden />
                    {t(`reviews.status.${r.status}`)}
                  </span>
                </div>
                <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                  {t('reviews.meta', { rating: r.rating, author: r.authorName, date: dateFmt.format(r.createdAt) })}
                </p>
                {r.body ? <p className="whitespace-pre-line break-words">{r.body}</p> : null}
                {reason ? <p className="text-[length:var(--text-subhead)]">{t('reviews.reason', { reason: t(`reviews.reasons.${reason}`) })}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {reviewActionsFor(r.status).map((a) => (
                    <AdminAction key={a} kind={{ type: 'review', id: r.id, action: a }} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={p.page} total={total} locale={locale} href={(page) => href(p.filter, page)} />
    </div>
  );
}
