import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseSettings } from '@/lib/settings';
import { Link } from '@/i18n/navigation';
import { BusinessCard } from '@/components/business-card';
import type { BusinessCard as BusinessCardData } from '@/lib/search';
import {
  weekdayInZone,
  minutesOfDayInZone,
  BUSINESS_TZ,
} from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function FavouritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('favourites');

  const session = await auth();
  if (!session?.user?.id) {
    return (
      <EmptyShell
        title={t('signInTitle')}
        body={t('signInBody')}
        actionHref="/account"
        actionLabel={t('signIn')}
        locale={locale}
      />
    );
  }

  const favourites = await db.favourite.findMany({
    where: { userId: session.user.id },
    include: {
      business: {
        include: {
          photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
          services: { where: { active: true }, orderBy: { priceCents: 'asc' } },
          openingHours: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (favourites.length === 0) {
    return (
      <EmptyShell
        title={t('emptyTitle')}
        body={t('emptyBody')}
        actionHref="/search"
        actionLabel={t('browse')}
        locale={locale}
      />
    );
  }

  const now = new Date();
  const cards: BusinessCardData[] = favourites.map(({ business: b }) => {
    const prices = b.services.map((s) => s.priceCents);
    const today = b.openingHours.find((h) => h.weekday === weekdayInZone(now, BUSINESS_TZ));
    const minutes = minutesOfDayInZone(now, BUSINESS_TZ);
    const openNow = !!today && !today.closed && minutes >= today.opensMin && minutes < today.closesMin;
    void parseSettings(b.settings); // settings validated; slot computed on the profile page
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      category: b.category,
      city: b.city,
      tagline: b.tagline,
      logoUrl: b.logoUrl,
      coverUrl: b.photos[0]?.url ?? null,
      brandPrimary: b.brandPrimary,
      brandAccent: b.brandAccent,
      ratingAvg: b.ratingAvg,
      ratingCount: b.ratingCount,
      fromPriceCents: prices.length ? Math.min(...prices) : null,
      openNow,
      nextSlotIso: null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</h1>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <BusinessCard key={card.id} card={card} locale={locale} favourited />
        ))}
      </div>
    </div>
  );
}

async function EmptyShell({
  title,
  body,
  actionHref,
  actionLabel,
  locale,
}: {
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
  locale: string;
}) {
  const t = await getTranslations('favourites');
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</h1>
      <div className="mt-8 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-10 text-center shadow-sm">
        <p className="text-[length:var(--text-headline)] font-semibold">{title}</p>
        <p className="mt-1 text-[color:var(--label-secondary)]">{body}</p>
        <Link
          href={actionHref}
          locale={locale}
          className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 font-semibold text-[color:var(--tint-contrast)]"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
