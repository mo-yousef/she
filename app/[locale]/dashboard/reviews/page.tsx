import { EyeOff, Flag, ShieldCheck, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadReviewsForDashboard } from '@/lib/reviews-data';
import { REVIEW_FILTERS, parseReviewsParams, reviewsHref } from '@/lib/reviews-params';
import { BUSINESS_TZ } from '@/lib/time';
import { OwnerReplyForm } from '@/components/reviews/owner-reply-form';
import { ReportReviewButton } from '@/components/reviews/report-review-button';
import { FocusHeading } from '@/components/focus-heading';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'reviewsManage' });
  return { title: t('title') };
}

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const p = parseReviewsParams(await searchParams);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/reviews`);
  const t = await getTranslations('reviewsManage');
  const data = await loadReviewsForDashboard(business.id, p);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: BUSINESS_TZ });
  const num1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="space-y-6">
      <FocusHeading className="text-2xl font-bold tracking-tight">{t('title')}</FocusHeading>

      <Card className="p-4">
        <section aria-labelledby="rv-summary">
          <h2 id="rv-summary" className="sr-only">
            {t('summary.title')}
          </h2>
          {data.count === 0 ? (
            <p className="text-muted-foreground">{t('summary.none')}</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <p className="flex items-center gap-2 text-4xl font-bold">
                <Star className="h-7 w-7 fill-current text-primary" aria-hidden />
                <span aria-label={t('summary.rated', { rating: num1.format(data.average) })}>{num1.format(data.average)}</span>
                <span className="text-sm font-normal text-muted-foreground">{t('summary.count', { count: data.count })}</span>
              </p>
              <ul className="flex-1 space-y-1" aria-label={t('summary.distribution')}>
                {data.distribution.map((row) => (
                  <li key={row.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-12 tabular-nums">{t('summary.stars', { stars: row.stars })}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full bg-primary" style={{ width: `${row.percent}%` }} />
                    </span>
                    <span className="w-8 text-end tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </Card>

      <nav aria-label={t('filters.label')} className="flex flex-wrap gap-2">
        {REVIEW_FILTERS.map((f) => (
          <Link
            key={f}
            href={reviewsHref({ filter: f })}
            locale={locale}
            aria-current={p.filter === f ? 'page' : undefined}
            className={buttonVariants({ variant: p.filter === f ? 'default' : 'outline', size: 'lg' })}
          >
            {t(`filters.${f}`)}
          </Link>
        ))}
      </nav>

      {data.reviews.length === 0 ? (
        <Card className="gap-1 p-5">
          <p className="font-semibold">{t(data.totalAll === 0 ? 'empty.noneTitle' : 'empty.filteredTitle')}</p>
          <p className="text-muted-foreground">{t(data.totalAll === 0 ? 'empty.noneBody' : 'empty.filteredBody')}</p>
          {data.totalAll > 0 ? (
            <Link href={reviewsHref({})} locale={locale} className={`${buttonVariants({ variant: 'outline', size: 'lg' })} mt-2 w-fit`}>
              {t('empty.showAll')}
            </Link>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-4">
          {data.reviews.map((r) => (
            <li key={r.id}>
              <Card className="gap-3 p-4">
                <article aria-label={t('review.groupLabel', { author: r.authorName, rating: r.rating })} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 font-semibold" aria-label={t('review.rated', { rating: r.rating })}>
                      <Star className="h-4 w-4 fill-current text-primary" aria-hidden />
                      {r.rating} / 5
                    </span>
                    <span className="font-medium">{r.authorName}</span>
                    <time dateTime={r.createdAt.toISOString()} className="text-muted-foreground">
                      {dateFmt.format(r.createdAt)}
                    </time>
                    {r.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                        {t('review.verified')}
                      </span>
                    ) : null}
                    {r.status === 'FLAGGED' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <Flag className="h-4 w-4" aria-hidden />
                        {t('review.reported')}
                      </span>
                    ) : null}
                    {r.status === 'HIDDEN' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <EyeOff className="h-4 w-4" aria-hidden />
                        {t('review.hidden')}
                      </span>
                    ) : null}
                  </div>
                  {r.body ? <p className="whitespace-pre-line break-words">{r.body}</p> : <p className="text-muted-foreground">{t('review.noText')}</p>}
                  {r.status === 'HIDDEN' ? (
                    <>
                      <p className="text-muted-foreground">{t('review.hiddenBody')}</p>
                      {r.ownerReply ? <p className="whitespace-pre-line break-words border-s-2 border-border ps-3">{r.ownerReply}</p> : null}
                    </>
                  ) : (
                    <>
                      <OwnerReplyForm reviewId={r.id} initialReply={r.ownerReply} />
                      {r.status === 'VISIBLE' ? <ReportReviewButton reviewId={r.id} /> : <p className="text-xs text-muted-foreground">{t('review.reportedBody')}</p>}
                    </>
                  )}
                </article>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {data.pageCount > 1 ? (
        <nav aria-label={t('pagination.label')} className="flex items-center justify-between gap-3">
          {data.page > 1 ? (
            <Link href={reviewsHref({ filter: p.filter, page: data.page - 1 })} locale={locale} rel="prev" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              {t('pagination.previous')}
            </Link>
          ) : (
            <span />
          )}
          <span aria-current="page">{t('pagination.page', { page: data.page, count: data.pageCount })}</span>
          {data.page < data.pageCount ? (
            <Link href={reviewsHref({ filter: p.filter, page: data.page + 1 })} locale={locale} rel="next" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              {t('pagination.next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
