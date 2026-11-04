import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadHoursForDashboard } from '@/lib/business-hours';
import { HoursEditor } from '@/components/hours/hours-editor';
import { ClosuresManager } from '@/components/hours/closures-manager';
import { FocusHeading } from '@/components/focus-heading';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hours' });
  return { title: t('title') };
}

export default async function HoursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/hours`);
  const t = await getTranslations('hours');
  const data = await loadHoursForDashboard(business.id);
  return (
    <div className="space-y-8">
      <FocusHeading className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</FocusHeading>
      <section aria-labelledby="hours-weekly" className="space-y-3">
        <h2 id="hours-weekly" className="text-[length:var(--text-title3)] font-semibold">
          {t('weekly.title')}
        </h2>
        <p className="text-[color:var(--label-secondary)]">{t('weekly.hint')}</p>
        <HoursEditor
          days={data.days}
          stepSeconds={data.slotIntervalMin * 60}
          listingLive={business.status === 'PENDING' || business.status === 'PUBLISHED'}
        />
      </section>
      <section aria-labelledby="hours-closures" className="space-y-3">
        <h2 id="hours-closures" className="text-[length:var(--text-title3)] font-semibold">
          {t('closures.title')}
        </h2>
        <p className="text-[color:var(--label-secondary)]">{t('closures.hint')}</p>
        <ClosuresManager closures={data.closures} todayKey={data.todayKey} locale={locale} />
      </section>
    </div>
  );
}
