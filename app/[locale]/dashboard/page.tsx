import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadChecklistInput } from '@/lib/onboarding';
import { publishChecklist } from '@/lib/publish-checklist';
import { BUSINESS_TZ, addDaysToKey, localDateKey, zonedWallTimeToUtc } from '@/lib/time';
import { PublishChecklistView } from '@/components/publish-checklist-view';
import { SubmitForReviewForm } from '@/components/onboarding-forms';
import { submitForReviewAction } from '@/app/actions/onboarding';
import { Card } from '@/components/ui/card';

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
        <h1 className="text-2xl font-bold tracking-tight">{t('draftTitle')}</h1>
        <p className="text-muted-foreground">{t('draftBody')}</p>
        <PublishChecklistView items={items} locale={locale} />
        <SubmitForReviewForm action={submitForReviewAction} locale={locale} disabled={!canPublish} />
      </div>
    );
  }

  if (business.status === 'PENDING' || business.status === 'SUSPENDED') {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {business.status === 'PENDING' ? t('pendingTitle') : t('suspendedTitle')}
        </h1>
        <p className="text-muted-foreground">
          {business.status === 'PENDING' ? t('pendingBody') : t('suspendedBody')}
        </p>
        {business.status === 'PENDING' ? (
          <Link href="/onboarding?step=basics" locale={locale} className="inline-flex min-h-11 items-center text-primary">
            {t('editDetails')}
          </Link>
        ) : null}
      </div>
    );
  }

  // PUBLISHED: a tiny overview. Day boundaries are Europe/Nicosia midnights converted to UTC.
  const today = localDateKey(new Date(), BUSINESS_TZ);
  const startToday = zonedWallTimeToUtc(today, 0);
  const startTomorrow = zonedWallTimeToUtc(addDaysToKey(today, 1), 0);
  const startNextWeek = zonedWallTimeToUtc(addDaysToKey(today, 7), 0);
  const active = { businessId: business.id, status: { in: ['PENDING', 'CONFIRMED'] as ('PENDING' | 'CONFIRMED')[] } };
  const [todayCount, weekCount] = await Promise.all([
    db.booking.count({ where: { ...active, startsAt: { gte: startToday, lt: startTomorrow } } }),
    db.booking.count({ where: { ...active, startsAt: { gte: startToday, lt: startNextWeek } } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-2 p-5">
          <dt className="text-sm text-muted-foreground">{t('today')}</dt>
          <dd className="text-4xl font-bold">{todayCount}</dd>
        </Card>
        <Card className="gap-2 p-5">
          <dt className="text-sm text-muted-foreground">{t('thisWeek')}</dt>
          <dd className="text-4xl font-bold">{weekCount}</dd>
        </Card>
      </dl>
    </div>
  );
}
