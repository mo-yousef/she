import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Clock, MapPin, Phone, Instagram, MessageCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { formatPrice } from '@/lib/money';
import { localizedService } from '@/lib/localized-service';
import { formatSlot, formatDate } from '@/lib/format-datetime';
import { getFavouriteIds } from '@/lib/favourites';
import { getNextSlotIso } from '@/lib/availability-cache';
import { weekdayInZone, BUSINESS_TZ, addDaysToKey, localDateKey } from '@/lib/time';
import { isOpenNow } from '@/lib/hours';
import { buildBusinessJsonLd, serializeJsonLd, siteUrl, languageAlternates } from '@/lib/seo';
import { PUBLIC_REVIEW_STATUSES } from '@/lib/review-visibility';
import { computeRatingDistribution, isVerifiedReview } from '@/lib/reviews';
import { FavouriteButton } from '@/components/favourite-button';
import { RatingStars } from '@/components/rating-stars';
import { Gallery } from '@/components/gallery';
import { localizedBusinessText } from '@/lib/localized-business';
import { BusinessMapLazy } from '@/components/business-map-lazy';
import { BadgeCheck, Star } from 'lucide-react';

const REVIEWS_INITIAL_LIMIT = 10;

async function findPublishedBusiness(slug: string) {
  return db.business.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }], include: { translations: true } },
      staff: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      openingHours: { orderBy: { weekday: 'asc' } },
      closures: { where: { toDate: { gte: localDateKey(new Date(), BUSINESS_TZ) } }, orderBy: { fromDate: 'asc' } },
      photos: { orderBy: { sortOrder: 'asc' } },
      translations: true,
    },
  });
}

/**
 * Visible (non-moderated) reviews, latest first (req 2.2). The distribution is
 * computed from every visible rating; the list is capped unless `all` is set.
 */
async function findVisibleReviews(businessId: string, all: boolean) {
  const where = { businessId, status: { in: [...PUBLIC_REVIEW_STATUSES] } };
  const [ratings, list] = await Promise.all([
    db.review.findMany({ where, select: { rating: true } }),
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: all ? undefined : REVIEWS_INITIAL_LIMIT,
      include: { booking: { select: { status: true } } },
    }),
  ]);
  return { ratings, list };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const business = await findPublishedBusiness(slug);
  if (!business || business.status !== 'PUBLISHED') {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }

  const t = await getTranslations({ locale, namespace: 'seo' });
  const cat = await getTranslations({ locale, namespace: 'categories' });
  const cities = await getTranslations({ locale, namespace: 'cities' });
  const category = cat(business.category);
  const city = cities(business.city);
  const title = t('businessTitle', { name: business.name, category, city });
  const text = localizedBusinessText(business, business.translations, locale);
  const description = text.tagline || t('businessDescription', { name: business.name, category, city });
  const path = `/b/${slug}`;
  const canonical = `${siteUrl()}/${locale}${path}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languageAlternates(path),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'she.cy',
      // og:image comes from the opengraph-image.tsx file convention next to this page.
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

/**
 * Business profile page (requirement 2.1). Renders server-side with the
 * business's brand colours on header, primary buttons, selected states and
 * focus rings (--b1/--b2 set on the page root; the platform chrome in
 * site-header stays neutral). Section order: branded header, gallery, about,
 * services grouped by category, team, reviews, with a sticky desktop sidebar
 * and a fixed mobile bottom bar.
 *
 * SEO (3.4): generateMetadata + JSON-LD (lib/seo.ts) live here; OG image is
 * opengraph-image.tsx next to this file.
 *
 * Reviews (3.5): distribution bars + list + verified badge + owner replies.
 * Writing reviews is task 5.5 — this page is read-only.
 */

const WEEKDAY_KEYS = [
  'weekdaySun',
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
] as const;

function formatHourRange(opensMin: number, closesMin: number, locale: string): string {
  const fmt = (min: number) => {
    const d = new Date(Date.UTC(2000, 0, 1, Math.floor(min / 60), min % 60));
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(d);
  };
  return `${fmt(opensMin)}–${fmt(closesMin)}`;
}

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ reviews?: string }>;
}) {
  const { locale, slug } = await params;
  const { reviews: reviewsParam } = await searchParams;
  const showAllReviews = reviewsParam === 'all';
  setRequestLocale(locale);

  const business = await findPublishedBusiness(slug);

  if (!business || business.status !== 'PUBLISHED') notFound();

  const [favouriteIds, nextSlotIso, reviewData] = await Promise.all([
    getFavouriteIds(),
    getNextSlotIso(business.id),
    findVisibleReviews(business.id, showAllReviews),
  ]);
  const favourited = favouriteIds.has(business.id);
  const text = localizedBusinessText(business, business.translations, locale);
  const ratingDistribution = computeRatingDistribution(reviewData.ratings);
  const reviewTotal = reviewData.ratings.length;
  const canShowMore = !showAllReviews && reviewTotal > REVIEWS_INITIAL_LIMIT;

  const t = await getTranslations('business');
  const c = await getTranslations('common');
  const cat = await getTranslations('categories');
  const cities = await getTranslations('cities');
  const cardT = await getTranslations('card');

  const now = new Date();
  const todayWeekday = weekdayInZone(now, BUSINESS_TZ);
  const closureRanges = business.closures.map((c) => ({ from: c.fromDate, to: c.toDate }));
  const openNow = isOpenNow(business.openingHours, closureRanges, now);
  // Date range only (the owner's reason is private). Closures starting within 14 days.
  const soonKey = addDaysToKey(localDateKey(now, BUSINESS_TZ), 14);
  const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtKey = (k: string) => dayFmt.format(new Date(`${k}T00:00:00Z`));
  const closureNotes = closureRanges
    .filter((r) => r.from <= soonKey)
    .map((r) => (r.from === r.to ? fmtKey(r.from) : t('closureRange', { from: fmtKey(r.from), to: fmtKey(r.to) })));
  const fromPriceCents = business.services.length
    ? Math.min(...business.services.map((s) => s.priceCents))
    : null;

  const servicesByCategory = new Map<string, typeof business.services>();
  for (const s of business.services) {
    const list = servicesByCategory.get(s.category) ?? [];
    list.push(s);
    servicesByCategory.set(s.category, list);
  }

  const bookHref = `/b/${business.slug}/book`;

  const jsonLd = serializeJsonLd(
    buildBusinessJsonLd(
      {
        slug: business.slug,
        name: business.name,
        category: business.category,
        city: business.city,
        address: business.address,
        lat: business.lat,
        lng: business.lng,
        phone: business.phone,
        imageUrl: business.photos[0]?.url ?? business.logoUrl,
        ratingAvg: business.ratingAvg,
        ratingCount: business.ratingCount,
        openingHours: business.openingHours,
      },
      locale,
    ),
  );

  return (
    <div
      className="brand-scope mx-auto max-w-6xl px-4 pb-28 pt-6 lg:pb-10"
      style={
        {
          '--b1': business.brandPrimary,
          '--b2': business.brandAccent,
        } as CSSProperties
      }
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      {/* Branded header */}
      <header
        className="brand-on-dark relative overflow-hidden rounded-[var(--radius-card)] p-6 text-white sm:p-8"
        // The gradient only ever darkens --b1 (never mixes in --b2), so white text keeps at
        // least the contrast it has on --b1 itself across the whole header. (Mixing in a
        // light accent dropped glow/bliss seed colours below 4.5:1 at the far corner.)
        style={{
          background: `linear-gradient(135deg, var(--b1), color-mix(in srgb, var(--b1) 78%, black))`,
        }}
      >
        <div className="absolute right-4 top-4">
          <FavouriteButton businessId={business.id} initialFavourited={favourited} />
        </div>
        <div className="flex items-center gap-4">
          {business.logoUrl ? (
            <Image
              src={business.logoUrl}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full bg-white/20 object-cover ring-2 ring-white/40"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-[length:var(--text-title2)] font-bold ring-2 ring-white/40"
            >
              {business.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 pr-12">
            <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight sm:text-[length:var(--text-large-title)]">
              {business.name}
            </h1>
            {text.tagline ? <p className="mt-1 opacity-90">{text.tagline}</p> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[length:var(--text-subhead)]">
          {/* Surface pill: RatingStars uses theme label colours, unreadable on the brand fill. */}
          <span className="rounded-full bg-[color:var(--surface)] px-3 py-1 text-[color:var(--label)]">
            <RatingStars
              rating={business.ratingAvg}
              count={business.ratingCount}
              label={cardT('rating', { rating: business.ratingAvg.toFixed(1) })}
              reviewsLabel={cardT('reviews', { count: business.ratingCount })}
              newLabel={c('new')}
            />
          </span>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          <span>{cities(business.city)}</span>
          <OpenBadge open={openNow} openText={c('openNow')} closedText={c('closedNow')} />
        </div>

        <Link
          href={bookHref}
          locale={locale}
          className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-white px-6 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1)] shadow-sm transition-transform hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          {c('bookNow')}
        </Link>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-10">
          {/* Gallery + lightbox */}
          <section aria-labelledby="gallery-heading">
            <h2 id="gallery-heading" className="text-[length:var(--text-title3)] font-semibold">
              {t('gallery')}
            </h2>
            <Gallery
              photos={business.photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt }))}
              businessName={business.name}
            />
          </section>

          {/* About */}
          {text.about ? (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-[length:var(--text-title3)] font-semibold">
                {t('about')}
              </h2>
              <p className="mt-3 max-w-[75ch] text-[color:var(--label-secondary)]">
                {text.about}
              </p>
            </section>
          ) : null}

          {/* Services grouped by category */}
          <section aria-labelledby="services-heading">
            <h2 id="services-heading" className="text-[length:var(--text-title3)] font-semibold">
              {t('services')}
            </h2>
            <div className="mt-4 space-y-6">
              {Array.from(servicesByCategory.entries()).map(([category, services]) => (
                <div key={category}>
                  <h3 className="text-[length:var(--text-headline)] font-semibold text-[color:var(--label-secondary)]">
                    {cat(category)}
                  </h3>
                  <ul className="mt-2 divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
                    {services.map((s) => {
                      const text = localizedService(s, s.translations, locale);
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-4 p-4">
                          <div className="min-w-0">
                            <p className="font-medium">{text.name}</p>
                            {text.description ? (
                              <p className="text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                                {text.description}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                              {t('durationMin', { count: s.durationMin })}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="whitespace-nowrap font-semibold">
                              {formatPrice(s.priceCents, locale)}
                            </span>
                            <Link
                              href={`${bookHref}?service=${s.id}`}
                              locale={locale}
                              aria-label={t('bookServiceNamed', { name: text.name })}
                              className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-4 text-[length:var(--text-footnote)] font-semibold text-[color:var(--b1-contrast)]"
                            >
                              {t('bookService')}
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Team */}
          {business.staff.length > 0 ? (
            <section aria-labelledby="team-heading">
              <h2 id="team-heading" className="text-[length:var(--text-title3)] font-semibold">
                {t('team')}
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {business.staff.map((member) => (
                  <div key={member.id} className="text-center">
                    {member.photoUrl ? (
                      <Image
                        src={member.photoUrl}
                        alt=""
                        width={80}
                        height={80}
                        className="mx-auto h-20 w-20 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--surface)] text-[length:var(--text-title2)] font-semibold text-[color:var(--b1-text)] shadow-sm"
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <p className="mt-2 font-medium">{member.name}</p>
                    <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                      {member.role}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Reviews: distribution bars, list, verified badge, owner replies (req 2.2) */}
          <section aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="text-[length:var(--text-title3)] font-semibold">
              {t('reviews')}
            </h2>

            {reviewTotal === 0 ? (
              <div className="mt-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 text-[color:var(--label-secondary)] shadow-sm">
                {t('reviewsEmpty')}
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                {/* Summary: denormalized Business.ratingAvg/ratingCount, not recomputed */}
                <div className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm sm:flex-row sm:items-center">
                  <div className="flex shrink-0 flex-col items-center justify-center sm:w-28">
                    <span className="text-[length:var(--text-large-title)] font-bold">
                      {business.ratingAvg.toFixed(1)}
                    </span>
                    <RatingStars
                      rating={business.ratingAvg}
                      count={business.ratingCount}
                      label={cardT('rating', { rating: business.ratingAvg.toFixed(1) })}
                      reviewsLabel={cardT('reviews', { count: business.ratingCount })}
                      newLabel={c('new')}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {ratingDistribution.map((row) => (
                      <div key={row.stars} className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-right text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                          {t('starsCount', { count: row.stars })}
                        </span>
                        <div
                          className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--separator)]"
                          role="img"
                          aria-label={t('distributionBarLabel', { stars: row.stars, percent: row.percent })}
                        >
                          <div
                            className="h-full rounded-full bg-[color:var(--b1-text)]"
                            style={{ width: `${row.percent}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                          {row.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* List */}
                <ul className="space-y-4">
                  {reviewData.list.map((review) => {
                    const verified = isVerifiedReview(review);
                    return (
                      <li
                        key={review.id}
                        className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{review.authorName}</span>
                            {verified ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--success)] px-2 py-0.5 text-[length:var(--text-footnote)] font-medium text-[color:var(--success)]">
                                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                                {t('verifiedVisit')}
                              </span>
                            ) : null}
                          </div>
                          <time
                            dateTime={review.createdAt.toISOString()}
                            className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]"
                          >
                            {formatDate(review.createdAt.toISOString(), locale)}
                          </time>
                        </div>
                        <span
                          role="img"
                          className="mt-1 inline-flex items-center gap-1 text-[length:var(--text-subhead)]"
                          aria-label={cardT('rating', { rating: review.rating })}
                        >
                          <Star className="h-4 w-4 fill-current text-[color:var(--tint)]" aria-hidden />
                          <span className="font-semibold">{review.rating}</span>
                        </span>
                        {review.body ? (
                          <p className="mt-2 text-[color:var(--label-secondary)]">{review.body}</p>
                        ) : null}
                        {review.ownerReply ? (
                          <div className="mt-3 rounded-[var(--radius-button)] bg-[color:var(--bg)] p-3">
                            <p className="text-[length:var(--text-footnote)] font-semibold">
                              {t('ownerReplyLabel', { name: business.name })}
                            </p>
                            <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                              {review.ownerReply}
                            </p>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                {canShowMore ? (
                  <Link
                    href={`/b/${business.slug}?reviews=all`}
                    locale={locale}
                    className="inline-flex min-h-11 items-center text-[length:var(--text-footnote)] font-semibold text-[color:var(--b1-text)] underline underline-offset-2"
                  >
                    {t('showMoreReviews')}
                  </Link>
                ) : null}
              </div>
            )}
          </section>
        </div>

        {/* Info cards: sticky sidebar on desktop; below lg the single-column grid
            places them after the reviews. One DOM copy, so the map mounts once. */}
        <aside>
          <div className="profile-sticky space-y-4">
            {/* Book + next slot: desktop only, the fixed bottom bar covers mobile */}
            <div className="hidden rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm lg:block">
              <Link
                href={bookHref}
                locale={locale}
                className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1-contrast)]"
              >
                {t('sidebarBook')}
              </Link>
              <p className="mt-3 flex items-center gap-2 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                {nextSlotIso ? t('nextSlot', { when: formatSlot(nextSlotIso, locale) }) : t('noSlots')}
              </p>
            </div>

            <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
              <h2 className="text-[length:var(--text-headline)] font-semibold">{t('hours')}</h2>
              <ul className="mt-3 space-y-1 text-[length:var(--text-subhead)]">
                {business.openingHours.map((h) => {
                  const isToday = h.weekday === todayWeekday;
                  return (
                    <li
                      key={h.weekday}
                      className={`flex items-center justify-between ${isToday ? 'font-semibold text-[color:var(--b1-text)]' : 'text-[color:var(--label-secondary)]'}`}
                    >
                      <span>{t(WEEKDAY_KEYS[h.weekday])}</span>
                      <span>{h.closed ? t('closed') : formatHourRange(h.opensMin, h.closesMin, locale)}</span>
                    </li>
                  );
                })}
              </ul>
              {closureNotes.length > 0 ? (
                <p className="mt-3 text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
                  {t('closedOn', { dates: closureNotes.join(', ') })}
                </p>
              ) : null}
            </div>

            <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
              {business.address ? (
                <p className="flex items-start gap-2 text-[length:var(--text-subhead)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--b1-text)]" aria-hidden />
                  {business.address}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {business.phone ? (
                  <a
                    href={`tel:${business.phone}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-footnote)] font-medium"
                  >
                    <Phone className="h-4 w-4" aria-hidden />
                    {t('call')}
                  </a>
                ) : null}
                {business.whatsapp ? (
                  <a
                    href={`https://wa.me/${business.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-footnote)] font-medium"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    {t('whatsapp')}
                  </a>
                ) : null}
                {business.instagram ? (
                  <a
                    href={`https://instagram.com/${business.instagram.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[color:var(--control-border)] px-3 text-[length:var(--text-footnote)] font-medium"
                  >
                    <Instagram className="h-4 w-4" aria-hidden />
                    {t('instagram')}
                  </a>
                ) : null}
              </div>
              {business.lat != null && business.lng != null ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${business.lat},${business.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center text-[length:var(--text-footnote)] font-medium text-[color:var(--b1-text)] underline underline-offset-2"
                >
                  {t('openInMaps')}
                </a>
              ) : null}
              {business.lat != null && business.lng != null ? (
                <div className="mt-3">
                  <BusinessMapLazy lat={business.lat} lng={business.lng} />
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile fixed bottom bar */}
      <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--separator)] px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {fromPriceCents != null ? c('from', { price: formatPrice(fromPriceCents, locale) }) : ''}
            </p>
            <p className="truncate text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
              {nextSlotIso ? t('nextSlot', { when: formatSlot(nextSlotIso, locale) }) : t('noSlots')}
            </p>
          </div>
          <Link
            href={bookHref}
            locale={locale}
            className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-button)] bg-[color:var(--b1)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--b1-contrast)]"
          >
            {c('bookNow')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function OpenBadge({
  open,
  openText,
  closedText,
}: {
  open: boolean;
  openText: string;
  closedText: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: open ? 'var(--success)' : 'rgba(255,255,255,0.7)' }}
      />
      {open ? openText : closedText}
    </span>
  );
}
