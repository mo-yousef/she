import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadTeamForDashboard } from '@/lib/team';
import { TeamManager } from '@/components/team/team-manager';
import { FocusHeading } from '@/components/focus-heading';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'team' });
  return { title: t('title') };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/team`);
  const t = await getTranslations('team');
  const data = await loadTeamForDashboard(business.id);
  return (
    <div className="space-y-4">
      <FocusHeading className="text-2xl font-bold tracking-tight">{t('title')}</FocusHeading>
      <TeamManager
        members={data.members}
        services={data.services}
        businessHours={data.businessHours}
        todayKey={data.todayKey}
        listingLive={business.status === 'PENDING' || business.status === 'PUBLISHED'}
      />
    </div>
  );
}
