import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadServicesForDashboard } from '@/lib/services';
import { ServicesManager } from '@/components/services/services-manager';
import { FocusHeading } from '@/components/focus-heading';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services' });
  return { title: t('title') };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/services`);
  const t = await getTranslations('services');
  const { services, staff } = await loadServicesForDashboard(business.id);

  return (
    <div className="space-y-4">
      <FocusHeading className="text-2xl font-bold tracking-tight">{t('title')}</FocusHeading>
      <ServicesManager
        services={services}
        staff={staff}
        locale={locale}
        listingLive={business.status === 'PENDING' || business.status === 'PUBLISHED'}
      />
    </div>
  );
}
