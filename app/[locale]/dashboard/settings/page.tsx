import { getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/db';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadChecklistInput } from '@/lib/onboarding';
import { publishChecklist } from '@/lib/publish-checklist';
import { parseSettings } from '@/lib/settings';
import { countUpcomingActive } from '@/lib/settings-save';
import { submitForReviewAction } from '@/app/actions/onboarding';
import { BookingRulesForm } from '@/components/settings/booking-rules-form';
import { UnpublishButton } from '@/components/settings/unpublish-button';
import { BusinessStatusBadge } from '@/components/business-status-badge';
import { PublishChecklistView } from '@/components/publish-checklist-view';
import { SubmitForReviewForm } from '@/components/onboarding-forms';
import { FocusHeading } from '@/components/focus-heading';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  return { title: t('title') };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/settings`);
  const t = await getTranslations('settings');
  const row = await db.business.findUniqueOrThrow({ where: { id: business.id }, select: { settings: true } });
  const settings = parseSettings(row.settings);
  const live = business.status === 'PUBLISHED' || business.status === 'PENDING';
  const upcoming = live ? await countUpcomingActive(business.id) : 0;
  const checklist = business.status === 'DRAFT' ? publishChecklist((await loadChecklistInput(db, business.id))!) : null;

  return (
    <div className="space-y-8">
      <FocusHeading className="text-2xl font-bold tracking-tight">{t('title')}</FocusHeading>

      <section aria-labelledby="st-rules" className="space-y-3">
        <h2 id="st-rules" className="text-lg font-semibold">
          {t('rules.title')}
        </h2>
        <p className="text-muted-foreground">{t('rules.intro')}</p>
        <BookingRulesForm initial={settings} />
      </section>

      <section aria-labelledby="st-status" className="space-y-3">
        <h2 id="st-status" className="text-lg font-semibold">
          {t('status.title')}
        </h2>
        <Card>
          <CardContent className="space-y-3">
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('status.current')}</span>
              <BusinessStatusBadge status={business.status} />
            </p>
            <p className="text-muted-foreground">{t(`status.body.${business.status}`)}</p>
            {checklist ? (
              <>
                <PublishChecklistView items={checklist.items} locale={locale} />
                <SubmitForReviewForm action={submitForReviewAction} locale={locale} disabled={!checklist.canPublish} />
              </>
            ) : null}
            {live ? <UnpublishButton upcoming={upcoming} pending={business.status === 'PENDING'} /> : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
