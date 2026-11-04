import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, CalendarCheck, CalendarDays, Clock, ExternalLink, Hourglass, Plus, Scissors, Star, Store, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { formatDayShort, formatTime } from '@/lib/format-datetime';
import { formatPrice } from '@/lib/money';
import { db } from '@/lib/db';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadChecklistInput } from '@/lib/onboarding';
import { publishChecklist } from '@/lib/publish-checklist';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from '@/lib/time';
import { PublishChecklistView } from '@/components/publish-checklist-view';
import { SubmitForReviewForm } from '@/components/onboarding-forms';
import { submitForReviewAction } from '@/app/actions/onboarding';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('overview.title') };
}

export default async function DashboardOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard`);
  const t = await getTranslations('dashboard.overview');

  if (business.status === 'DRAFT') {
    const input = await loadChecklistInput(db, business.id);
    const { items, canPublish } = publishChecklist(input!);
    return (
      <div className="space-y-4">
        <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('draftTitle')}</h1>
        <p className="text-[color:var(--label-secondary)]">{t('draftBody')}</p>
        <PublishChecklistView items={items} locale={locale} />
        <SubmitForReviewForm action={submitForReviewAction} locale={locale} disabled={!canPublish} />
      </div>
    );
  }

  if (business.status === 'PENDING' || business.status === 'SUSPENDED') {
    return (
      <div className="space-y-3">
        <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">
          {business.status === 'PENDING' ? t('pendingTitle') : t('suspendedTitle')}
        </h1>
        <p className="text-[color:var(--label-secondary)]">
          {business.status === 'PENDING' ? t('pendingBody') : t('suspendedBody')}
        </p>
        {business.status === 'PENDING' ? (
          <Link href="/onboarding?step=basics" locale={locale} className="inline-flex min-h-11 items-center text-[color:var(--tint)]">
            {t('editDetails')}
          </Link>
        ) : null}
      </div>
    );
  }

  // PUBLISHED. Day boundaries are Europe/Nicosia midnights converted to UTC.
  const now = new Date();
  const today = localDateKey(now, BUSINESS_TZ);
  const startToday = zonedWallTimeToUtc(today, 0);
  const startTomorrow = zonedWallTimeToUtc(addDaysToKey(today, 1), 0);
  const startNextWeek = zonedWallTimeToUtc(addDaysToKey(today, 7), 0);
  const active = { businessId: business.id, status: { in: ['PENDING', 'CONFIRMED'] as ('PENDING' | 'CONFIRMED')[] } };
  const [todayCount, weekAgg, pendingCount, rating, upcoming] = await Promise.all([
    db.booking.count({ where: { ...active, startsAt: { gte: startToday, lt: startTomorrow } } }),
    db.booking.aggregate({ where: { ...active, startsAt: { gte: startToday, lt: startNextWeek } }, _count: true, _sum: { priceCents: true } }),
    db.booking.count({ where: { businessId: business.id, status: 'PENDING', startsAt: { gte: now } } }),
    db.business.findUniqueOrThrow({ where: { id: business.id }, select: { ratingAvg: true, ratingCount: true } }),
    db.booking.findMany({
      where: { ...active, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 6,
      select: {
        id: true,
        startsAt: true,
        status: true,
        guestName: true,
        service: { select: { name: true } },
        staff: { select: { name: true } },
      },
    }),
  ]);

  const stats = [
    { label: t('today'), value: String(todayCount), icon: CalendarCheck },
    { label: t('thisWeek'), value: String(weekAgg._count), icon: CalendarDays },
    { label: t('needsConfirm'), value: String(pendingCount), icon: Hourglass, attention: pendingCount > 0 },
    { label: t('revenueWeek'), value: formatPrice(weekAgg._sum.priceCents ?? 0, locale), icon: Wallet },
  ];
  const actions = [
    { href: '/dashboard/calendar', label: t('actionCalendar'), icon: Plus },
    { href: '/dashboard/services', label: t('actionServices'), icon: Scissors },
    { href: '/dashboard/hours', label: t('actionHours'), icon: Clock },
    { href: '/dashboard/profile', label: t('actionProfile'), icon: Store },
  ] as const;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[color:var(--label-secondary)]">{business.name}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05}>
            <div
              className={`h-full rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-5 ${
                s.attention ? 'ring-2 ring-[color:var(--tint)]' : ''
              }`}
            >
              <s.icon className="h-5 w-5 text-[color:var(--tint)]" aria-hidden />
              <dd className="mt-3 text-[length:var(--text-title1)] font-bold leading-none tracking-tight">{s.value}</dd>
              <dt className="mt-1.5 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">{s.label}</dt>
            </div>
          </Reveal>
        ))}
      </dl>

      <div className="grid gap-8 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <section aria-labelledby="upcoming">
          <div className="flex items-center justify-between">
            <h2 id="upcoming" className="text-[length:var(--text-title3)] font-semibold">
              {t('upcomingTitle')}
            </h2>
            <Link
              href="/dashboard/bookings"
              locale={locale}
              className="press inline-flex min-h-11 items-center gap-1 px-1 text-[length:var(--text-subhead)] font-medium text-[color:var(--tint)]"
            >
              {t('viewAll')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-[color:var(--label-secondary)] shadow-sm">
              {t('upcomingEmpty')}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--separator)] overflow-hidden rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center gap-4 p-4">
                  <div className="w-20 flex-none text-center">
                    <p className="text-[length:var(--text-headline)] font-semibold">{formatTime(b.startsAt.toISOString(), locale)}</p>
                    <p className="text-[length:var(--text-caption)] text-[color:var(--label-secondary)]">
                      {formatDayShort(b.startsAt.toISOString(), locale)}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.guestName ?? t('guestFallback')}</p>
                    <p className="truncate text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                      {b.service.name} · {t('withStaff', { name: b.staff.name })}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-[length:var(--text-caption)] font-semibold ${
                      b.status === 'PENDING'
                        ? 'border border-dashed border-[color:var(--tint)] text-[color:var(--tint)]'
                        : 'bg-[color:var(--tint)] text-[color:var(--tint-contrast)]'
                    }`}
                  >
                    {t(b.status === 'PENDING' ? 'statusPENDING' : 'statusCONFIRMED')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="quick">
          <h2 id="quick" className="text-[length:var(--text-title3)] font-semibold">
            {t('quickTitle')}
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {actions.map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  locale={locale}
                  className="press flex h-full min-h-24 flex-col justify-between gap-3 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <a.icon className="h-6 w-6 text-[color:var(--tint)]" aria-hidden />
                  <span className="text-[length:var(--text-subhead)] font-semibold leading-snug">{a.label}</span>
                </Link>
              </li>
            ))}
            <li className="col-span-2">
              <Link
                href={`/b/${business.slug}`}
                locale={locale}
                className="press flex min-h-12 items-center justify-between rounded-[var(--radius-card)] bg-[color:var(--tint)] px-4 text-[length:var(--text-subhead)] font-semibold text-[color:var(--tint-contrast)]"
              >
                {t('actionPage')}
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          </ul>
          <p className="mt-4 flex items-center gap-2 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
            <Star className="h-4 w-4 text-[color:var(--tint)]" aria-hidden />
            {rating.ratingCount > 0
              ? `${rating.ratingAvg.toFixed(1)} · ${t('reviewsCount', { count: rating.ratingCount })}`
              : t('noRating')}
          </p>
        </section>
      </div>
    </div>
  );
}
