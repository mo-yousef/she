import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadCalendarData } from '@/lib/calendar-data';
import {
  calendarQuery,
  parseCalendarParams,
  shiftDateKey,
  visibleDateKeys,
} from '@/lib/calendar-params';
import { BUSINESS_TZ, localDateKey, zonedWallTimeToUtc } from '@/lib/time';
import { CalendarGrid, type ColumnView } from '@/components/calendar/calendar-grid';

export const dynamic = 'force-dynamic';

const LOCALE_MAP: Record<string, string> = { en: 'en-GB', el: 'el-GR', ru: 'ru-RU' };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return { title: t('title') };
}

const navLink =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border bg-background px-3 font-medium shadow-xs hover:bg-accent hover:text-accent-foreground';
const chip = (active: boolean) =>
  `inline-flex min-h-11 max-w-full items-center break-words rounded-full px-4 py-1 font-medium ${active
    ? 'bg-primary text-primary-foreground'
    : 'border bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
  }`;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(
    locale,
    `/${locale}/dashboard/calendar`,
  );
  const t = await getTranslations('calendar');

  const todayKey = localDateKey(new Date(), BUSINESS_TZ);
  const p = parseCalendarParams(sp, todayKey);
  const data = await loadCalendarData(business.id, p, locale);

  const intl = LOCALE_MAP[locale] ?? 'en-GB';
  const fmt = (key: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intl, { ...opts, timeZone: BUSINESS_TZ }).format(
      zonedWallTimeToUtc(key, 12 * 60),
    );

  const keys = visibleDateKeys(p.view, p.dateKey);
  const staffName = new Map(data.staff.map((s) => [s.id, s.name]));
  const columns: ColumnView[] = data.columns.map((c) =>
    p.view === 'day'
      ? { ...c, heading: staffName.get(c.staffId) ?? '' }
      : {
        ...c,
        heading: fmt(c.dateKey, { weekday: 'short' }),
        sub: fmt(c.dateKey, { day: 'numeric', month: 'short' }),
      },
  );

  // Week view always shows one person: link with the effective one so paging keeps it.
  const linkStaff = p.view === 'week' ? data.activeStaffId : p.staffId;
  const href = (over: {
    view?: 'day' | 'week';
    dateKey?: string;
    staffId?: string | null;
    showCancelled?: boolean;
  }) =>
    `/dashboard/calendar?${calendarQuery({
      view: over.view ?? p.view,
      dateKey: over.dateKey ?? p.dateKey,
      staffId: over.staffId === undefined ? linkStaff : over.staffId,
      showCancelled: over.showCancelled ?? p.showCancelled,
    })}`;

  const dayLabel = fmt(p.dateKey, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const rangeLabel =
    p.view === 'day'
      ? dayLabel
      : `${fmt(keys[0]!, { day: 'numeric', month: 'short' })} – ${fmt(keys[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const gridLabel =
    p.view === 'day'
      ? t('grid.labelDay', { date: dayLabel })
      : t('grid.labelWeek', {
        staff: staffName.get(data.activeStaffId ?? '') ?? '',
        from: fmt(keys[0]!, { day: 'numeric', month: 'long' }),
        to: fmt(keys[6]!, { day: 'numeric', month: 'long' }),
      });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      <nav aria-label={t('nav.label')} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href({ dateKey: shiftDateKey(p.view, p.dateKey, -1) })}
            locale={locale}
            aria-label={t('nav.previous')}
            className={navLink}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Link>
          <Link href={href({ dateKey: todayKey })} locale={locale} className={navLink}>
            {t('nav.today')}
          </Link>
          <Link
            href={href({ dateKey: shiftDateKey(p.view, p.dateKey, 1) })}
            locale={locale}
            aria-label={t('nav.next')}
            className={navLink}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
          <p className="min-w-0 flex-1 font-semibold" aria-live="polite">
            {rangeLabel}
          </p>
          <div
            role="group"
            aria-label={t('nav.viewLabel')}
            className="flex rounded-full border bg-background p-0.5"
          >
            {(['day', 'week'] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                locale={locale}
                aria-current={p.view === v ? 'true' : undefined}
                className={`inline-flex min-h-11 min-w-20 items-center justify-center rounded-full px-4 font-medium ${p.view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
                  }`}
              >
                {t(`nav.${v}`)}
              </Link>
            ))}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('nav.staffLabel')}
        >
          {p.view === 'day' ? (
            <Link
              href={href({ staffId: null })}
              locale={locale}
              aria-current={!p.staffId ? 'true' : undefined}
              className={chip(!p.staffId)}
            >
              {t('nav.allStaff')}
            </Link>
          ) : null}
          {data.staff.map((s) => {
            const active =
              p.view === 'week' ? s.id === data.activeStaffId : s.id === p.staffId;
            return (
              <Link
                key={s.id}
                href={href({ staffId: s.id })}
                locale={locale}
                aria-current={active ? 'true' : undefined}
                className={chip(active)}
              >
                {s.name}
              </Link>
            );
          })}
          <Link
            href={href({ showCancelled: !p.showCancelled })}
            locale={locale}
            className="ml-auto inline-flex min-h-11 items-center px-2 text-primary underline-offset-2 hover:underline"
          >
            {p.showCancelled ? t('nav.hideCancelled') : t('nav.showCancelled')}
          </Link>
        </div>
      </nav>

      <CalendarGrid
        locale={locale}
        label={gridLabel}
        todayKey={todayKey}
        dateKey={p.dateKey}
        axis={data.axis}
        columns={columns}
        staff={data.staff}
        services={data.services}
        slotIntervalMin={data.slotIntervalMin}
        activeStaffId={data.activeStaffId}
      />
    </div>
  );
}
