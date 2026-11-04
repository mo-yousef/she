import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Link } from '@/i18n/navigation';
import { CATEGORIES, CITIES } from '@/lib/catalogue';
import { LANGUAGES } from '@/lib/onboarding-schema';
import { findOwnerBusinessId } from '@/lib/owner-auth';
import { loadChecklistInput } from '@/lib/onboarding';
import { ONBOARDING_STEPS, publishChecklist } from '@/lib/publish-checklist';
import { WEEKDAY_ORDER, formatTimeOfDay } from '@/lib/hours';
import { centsToInputValue } from '@/lib/money';
import { StepForm, HoursForm, StepHeading, SubmitForReviewForm, type FieldDef } from '@/components/onboarding-forms';
import { PublishChecklistView } from '@/components/publish-checklist-view';
import {
  saveBasicsAction,
  saveHoursAction,
  saveLocationAction,
  saveServicesAction,
  submitForReviewAction,
} from '@/app/actions/onboarding';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const STEPS = [...ONBOARDING_STEPS.filter((s) => s !== 'photos'), 'review'] as const;
type Step = (typeof STEPS)[number];
const WEEKDAY_KEYS = ['weekdaySun', 'weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat'] as const;
// Mon-Fri 09:00-18:00, Sat 09:00-14:00, Sun closed.
const DEFAULT_HOURS: Record<number, [boolean, string, string]> = {
  0: [true, '09:00', '14:00'],
  6: [false, '09:00', '14:00'],
};

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const requested = STEPS.find((s) => s === sp.step) ?? 'basics';
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/account?callbackUrl=${encodeURIComponent(`/${locale}/onboarding?step=${requested}`)}`);
  }
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  const t = await getTranslations('onboarding');
  if (!user || user.role === 'STAFF') {
    return (
      <div className="mx-auto max-w-xl px-4 pb-24 pt-10">
        <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('notAllowedTitle')}</h1>
        <p className="mt-2 text-[color:var(--label-secondary)]">{t('notAllowedBody')}</p>
      </div>
    );
  }

  const businessId = await findOwnerBusinessId(session.user.id);
  // Later steps need a business; the first step creates it.
  if (!businessId && requested !== 'basics') redirect(`/${locale}/onboarding?step=basics`);
  const business = businessId
    ? await db.business.findUniqueOrThrow({
      where: { id: businessId },
      include: {
        openingHours: true,
        services: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 },
        staff: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 },
      },
    })
    : null;
  if (requested === 'review' && business && business.status !== 'DRAFT') redirect(`/${locale}/dashboard`);

  const stepIndex = STEPS.indexOf(requested);
  const cat = await getTranslations('categories');
  const cities = await getTranslations('cities');
  const search = await getTranslations('search');
  const hoursT = await getTranslations('business');
  const next = t('continue');

  let body: React.ReactNode;
  if (requested === 'basics') {
    const fields: FieldDef[] = [
      { name: 'name', kind: 'text', label: t('basics.name'), required: true, maxLength: 80, autoComplete: 'organization', value: business?.name ?? '' },
      { name: 'category', kind: 'select', label: t('basics.category'), required: true, options: CATEGORIES.map((c) => ({ value: c, label: cat(c) })), value: business?.category ?? '' },
      { name: 'city', kind: 'select', label: t('basics.city'), required: true, options: CITIES.map((c) => ({ value: c, label: cities(c) })), value: business?.city ?? '' },
      {
        name: 'languages',
        kind: 'checkboxes',
        label: t('basics.languages'),
        hint: t('basics.languagesHint'),
        required: true,
        options: LANGUAGES.map((l) => ({ value: l, label: search(l === 'en' ? 'langEn' : l === 'el' ? 'langEl' : 'langRu') })),
        value: business?.languages.length ? business.languages : ['en'],
      },
      { name: 'tagline', kind: 'text', label: t('basics.tagline'), hint: t('basics.taglineHint'), maxLength: 120, value: business?.tagline ?? '' },
      { name: 'about', kind: 'textarea', label: t('basics.about'), maxLength: 2000, value: business?.about ?? '' },
    ];
    body = <StepForm action={saveBasicsAction} locale={locale} fields={fields} submitLabel={next} />;
  } else if (requested === 'location') {
    const fields: FieldDef[] = [
      { name: 'address', kind: 'text', label: t('location.address'), required: true, maxLength: 200, autoComplete: 'street-address', value: business?.address ?? '' },
      { name: 'phone', kind: 'text', type: 'tel', inputMode: 'tel', autoComplete: 'tel', label: t('location.phone'), hint: t('location.phoneHint'), value: business?.phone ?? '' },
      { name: 'whatsapp', kind: 'text', type: 'tel', inputMode: 'tel', autoComplete: 'off', label: t('location.whatsapp'), hint: t('location.phoneHint'), value: business?.whatsapp ?? '' },
      { name: 'instagram', kind: 'text', label: t('location.instagram'), hint: t('location.instagramHint'), maxLength: 60, value: business?.instagram ?? '' },
      { name: 'website', kind: 'text', type: 'url', inputMode: 'url', autoComplete: 'url', label: t('location.website'), maxLength: 200, value: business?.website ?? '' },
      // shortcut: no geocoding yet, so coordinates are optional manual fields. The public
      // page hides the map without them. Revisit with an address-search provider.
      { name: 'lat', kind: 'text', inputMode: 'decimal', label: t('location.lat'), hint: t('location.coordsHint'), value: business?.lat?.toString() ?? '' },
      { name: 'lng', kind: 'text', inputMode: 'decimal', label: t('location.lng'), value: business?.lng?.toString() ?? '' },
    ];
    body = <StepForm action={saveLocationAction} locale={locale} fields={fields} submitLabel={next} />;
  } else if (requested === 'hours') {
    const byDay = new Map(business?.openingHours.map((h) => [h.weekday, h]));
    const rows = WEEKDAY_ORDER.map((weekday) => {
      const saved = byDay.get(weekday);
      const d = DEFAULT_HOURS[weekday];
      return {
        weekday,
        label: hoursT(WEEKDAY_KEYS[weekday]!),
        closed: saved ? saved.closed : (d?.[0] ?? false),
        open: saved && !saved.closed ? formatTimeOfDay(saved.opensMin) : (d?.[1] ?? '09:00'),
        close: saved && !saved.closed ? formatTimeOfDay(saved.closesMin) : (d?.[2] ?? '18:00'),
      };
    });
    body = <HoursForm action={saveHoursAction} locale={locale} rows={rows} submitLabel={next} />;
  } else if (requested === 'services') {
    const svc = business?.services[0];
    const fields: FieldDef[] = [
      { name: 'serviceName', kind: 'text', label: t('services.serviceName'), required: true, maxLength: 80, value: svc?.name ?? '' },
      { name: 'serviceCategory', kind: 'select', label: t('services.serviceCategory'), required: true, options: CATEGORIES.map((c) => ({ value: c, label: cat(c) })), value: svc?.category ?? business?.category ?? '' },
      { name: 'durationMin', kind: 'number', inputMode: 'numeric', label: t('services.duration'), hint: t('services.durationHint'), required: true, min: 5, max: 480, step: 5, value: String(svc?.durationMin ?? 60) },
      { name: 'price', kind: 'text', inputMode: 'decimal', label: t('services.price'), hint: t('services.priceHint'), required: true, maxLength: 9, value: svc ? centsToInputValue(svc.priceCents) : '' },
      { name: 'staffName', kind: 'text', label: t('services.staffName'), hint: t('services.staffHint'), required: true, maxLength: 60, value: business?.staff[0]?.name ?? '' },
    ];
    body = <StepForm action={saveServicesAction} locale={locale} fields={fields} submitLabel={next} />;
  } else {
    const input = await loadChecklistInput(db, business!.id);
    const { items, canPublish } = publishChecklist(input!);
    body = (
      <div className="space-y-4">
        <p className="text-[color:var(--label-secondary)]">{t('review.intro')}</p>
        <PublishChecklistView items={items} locale={locale} />
        <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">{t('review.approvalNote')}</p>
        <SubmitForReviewForm action={submitForReviewAction} locale={locale} disabled={!canPublish} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-8">
      <nav aria-label={t('progress')}>
        <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-footnote)]">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={s === requested ? 'step' : undefined} className={s === requested ? 'font-semibold' : 'text-[color:var(--label-secondary)]'}>
              {business && s !== requested ? (
                <Link href={`/onboarding?step=${s}`} locale={locale} className="inline-flex min-h-11 items-center">
                  {i + 1}. {t(`steps.${s}`)}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center">
                  {i + 1}. {t(`steps.${s}`)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
        {t('stepOf', { current: stepIndex + 1, total: STEPS.length })}
      </p>
      <StepHeading id="step-heading">{t(`steps.${requested satisfies Step}`)}</StepHeading>
      <div className="mt-5">{body}</div>
    </div>
  );
}
