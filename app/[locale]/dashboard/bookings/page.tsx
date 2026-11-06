import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { countAllBookings, loadBookingsPage } from '@/lib/bookings-data';
import {
  BOOKING_FILTERS,
  BOOKING_SORTS,
  MAX_QUERY_LENGTH,
  bookingsQuery,
  hasActiveFilters,
  parseBookingsParams,
  type BookingsParams,
} from '@/lib/bookings-params';
import { BookingsTable } from '@/components/bookings/bookings-table';
import { FocusHeading } from '@/components/focus-heading';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Native <select> kept (filter form must work without JS, shareable URL); styled to match Input.
const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'bookings' });
  return { title: t('title') };
}

const pageLink = `${buttonVariants({ variant: 'outline', size: 'lg' })} min-h-11 min-w-11`;
const disabledLink = `${pageLink} pointer-events-none opacity-50`;
const chip = (active: boolean) =>
  `${buttonVariants({ variant: active ? 'default' : 'outline', size: 'lg' })} min-h-11 flex-none rounded-full`;
const textLink = `${buttonVariants({ variant: 'link', size: 'lg' })} min-h-11 px-0 underline underline-offset-2`;

export default async function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/bookings`);
  const t = await getTranslations('bookings');

  const p = parseBookingsParams(sp);
  const data = await loadBookingsPage(business.id, p, locale);
  const filtered = hasActiveFilters(p);
  // Only needed to pick the right empty state.
  const everBooked = data.total === 0 && !filtered ? (await countAllBookings(business.id)) > 0 : true;

  const href = (over: Partial<BookingsParams>) => {
    const q = bookingsQuery({ ...p, page: 1, ...over });
    return `/dashboard/bookings${q ? `?${q}` : ''}`;
  };

  return (
    <div className="space-y-4">
      <FocusHeading className="text-2xl font-bold tracking-tight">
        {t('title')}
      </FocusHeading>

      <section aria-label={t('filters.label')} className="space-y-3">
        <div
          role="group"
          aria-label={t('filters.statusLabel')}
          className="flex flex-wrap gap-2"
        >
          {BOOKING_FILTERS.map((s) => (
            <Link
              key={s}
              href={href({ status: s })}
              locale={locale}
              aria-current={p.status === s ? 'true' : undefined}
              className={chip(p.status === s)}
            >
              {t(`status.${s}`)}
            </Link>
          ))}
        </div>

        {/* Plain GET form: works without JS and produces a shareable URL. Changing a filter
            always returns to page 1 because `page` is not a field. */}
        <Card className="p-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input type="hidden" name="status" value={p.status} />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="b-q">{t('filters.search')}</Label>
              <Input
                id="b-q"
                name="q"
                type="search"
                inputMode="search"
                autoComplete="off"
                maxLength={MAX_QUERY_LENGTH}
                defaultValue={p.q}
                placeholder={t('filters.searchPlaceholder')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-from">{t('filters.from')}</Label>
              <Input id="b-from" name="from" type="date" autoComplete="off" defaultValue={p.from ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-to">{t('filters.to')}</Label>
              <Input id="b-to" name="to" type="date" autoComplete="off" defaultValue={p.to ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-staff">{t('filters.staff')}</Label>
              <select id="b-staff" name="staff" defaultValue={p.staffId ?? ''} className={selectClass}>
                <option value="">{t('filters.allStaff')}</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-sort">{t('filters.sort')}</Label>
              <select id="b-sort" name="sort" defaultValue={p.sort} className={selectClass}>
                {BOOKING_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sort.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
              <Button type="submit" size="lg">
                {t('filters.apply')}
              </Button>
              {filtered || p.sort !== 'date' ? (
                <Link href="/dashboard/bookings" locale={locale} className={textLink}>
                  {t('filters.clear')}
                </Link>
              ) : null}
            </div>
          </form>
        </Card>
      </section>

      <p role="status" aria-live="polite" className="text-muted-foreground">
        {t('summary', { count: data.total })}
      </p>

      {data.total === 0 ? (
        <Card className="gap-2 p-5">
          {filtered ? (
            <>
              <h2 className="text-lg font-semibold">
                {t('empty.filteredTitle')}
              </h2>
              <p className="text-muted-foreground">{t('empty.filteredBody')}</p>
              <Link href="/dashboard/bookings" locale={locale} className={textLink}>
                {t('filters.clear')}
              </Link>
            </>
          ) : everBooked ? (
            <>
              <h2 className="text-lg font-semibold">
                {t('empty.upcomingTitle')}
              </h2>
              <p className="text-muted-foreground">{t('empty.upcomingBody')}</p>
              <Link href={href({ status: 'all' })} locale={locale} className={textLink}>
                {t('empty.viewAll')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">
                {t('empty.noneTitle')}
              </h2>
              <p className="text-muted-foreground">{t('empty.noneBody')}</p>
              {business.status === 'PUBLISHED' ? (
                <Link href={`/b/${business.slug}`} locale={locale} className={textLink}>
                  {t('empty.viewPage')}
                </Link>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <>
          <BookingsTable rows={data.rows} locale={locale} />
          <nav
            aria-label={t('pagination.label')}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <Link
              href={href({ page: data.page - 1 })}
              locale={locale}
              aria-disabled={data.page <= 1 ? 'true' : undefined}
              tabIndex={data.page <= 1 ? -1 : undefined}
              className={data.page <= 1 ? disabledLink : pageLink}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
              {t('pagination.previous')}
            </Link>
            <p className="text-muted-foreground">
              {t('pagination.pageOf', { page: data.page, count: data.pageCount })}
            </p>
            <Link
              href={href({ page: data.page + 1 })}
              locale={locale}
              aria-disabled={data.page >= data.pageCount ? 'true' : undefined}
              tabIndex={data.page >= data.pageCount ? -1 : undefined}
              className={data.page >= data.pageCount ? disabledLink : pageLink}
            >
              {t('pagination.next')}
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Link>
          </nav>
        </>
      )}
    </div>
  );
}
