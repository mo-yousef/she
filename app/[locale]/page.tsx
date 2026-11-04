import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Sparkles, ShieldCheck, MapPin, ArrowRight, Search } from 'lucide-react';
import { Reveal, Pressable } from '@/components/motion/reveal';
import { photo, CATEGORY_PHOTO } from '@/lib/stock-photos';
import { Link } from '@/i18n/navigation';
import { Suspense } from 'react';
import { getFavouriteIds } from '@/lib/favourites';
import { parseSearchFilters } from '@/lib/search-params';
import { searchBusinesses } from '@/lib/search';
import { ResultsGrid, ResultsGridSkeleton } from '@/components/results-grid';
import { SortControl } from '@/components/sort-control';

/**
 * Home — the entrance to discovery (requirements §1.1, §1.2). Rendered on the
 * server: hero + search, category chips, a sortable grid of featured studios,
 * trust points and the "list your business" call to action. Sort is kept in the
 * URL so the view is shareable and survives refresh.
 */
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const t = await getTranslations('home');
  const c = await getTranslations('common');
  const cat = await getTranslations('categories');

  const sort = parseSearchFilters(sp).sort ?? 'recommended';

  const categories = ['nails', 'lashes', 'hair', 'makeup', 'facials', 'blowdry'] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-4 md:pt-8">
      {/* Hero: photo with a brand-tinted scrim so white text keeps contrast. */}
      <section className="relative isolate overflow-hidden rounded-[var(--radius-sheet)] bg-[color:var(--colors--neutral--800)] text-white">
        <Image
          src={photo('lashes', 1600, 1000)}
          alt=""
          fill
          priority
          sizes="(max-width: 1152px) 100vw, 1152px"
          className="hero-drift -z-10 object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(105deg,rgba(16,10,62,0.92)_0%,rgba(16,10,62,0.72)_55%,rgba(16,10,62,0.25)_100%)]"
        />
        <div className="p-6 pb-8 pt-10 sm:p-12 md:py-16">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[length:var(--text-footnote)] font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t('eyebrow')}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-4 max-w-[20ch] text-[length:var(--text-large-title)] font-extrabold leading-[var(--text-large-title--line-height)] tracking-tight sm:text-[2.75rem] sm:leading-[1.1]">
              {t('heroTitle')}
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 max-w-[52ch] text-[length:var(--text-body)] text-white/85">{t('heroSubtitle')}</p>
          </Reveal>

          <Reveal delay={0.24}>
            <form action={`/${locale}/search`} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">{t('searchPlaceholder')}</span>
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--label-secondary)]"
                  aria-hidden
                />
                <input
                  name="q"
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder={t('searchPlaceholder')}
                  className="h-13 min-h-[3.25rem] w-full rounded-[var(--radius-button)] border-0 bg-[color:var(--surface)] pl-12 pr-4 text-[length:var(--text-body)] text-[color:var(--label)]"
                />
              </label>
              <label className="relative sm:w-52">
                <span className="sr-only">{t('cityPlaceholder')}</span>
                <MapPin
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--label-secondary)]"
                  aria-hidden
                />
                <input
                  name="city"
                  type="text"
                  autoComplete="off"
                  enterKeyHint="search"
                  placeholder={t('cityPlaceholder')}
                  className="h-13 min-h-[3.25rem] w-full rounded-[var(--radius-button)] border-0 bg-[color:var(--surface)] pl-12 pr-4 text-[length:var(--text-body)] text-[color:var(--label)]"
                />
              </label>
              <button
                type="submit"
                className="press min-h-[3.25rem] rounded-[var(--radius-button)] bg-[color:var(--colors--primary--100)] px-8 text-[length:var(--text-headline)] font-semibold text-[color:var(--colors--neutral--800)]"
              >
                {c('search')}
              </button>
            </form>
          </Reveal>
        </div>
      </section>

      {/* Categories: swipeable image rail on mobile, six-up grid on desktop. */}
      <section className="mt-10" aria-labelledby="cats">
        <h2 id="cats" className="text-[length:var(--text-title2)] font-bold tracking-tight">
          {t('categories')}
        </h2>
        <ul className="snap-rail mt-4">
          {categories.map((key, i) => (
            <Reveal as="li" key={key} delay={i * 0.05} className="w-[7.5rem] md:w-auto">
              <Pressable>
                <Link
                  href={{ pathname: '/search', query: { cat: key } }}
                  locale={locale}
                  aria-label={t('categoryTileLabel', { category: cat(key) })}
                  className="relative block aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] bg-[color:var(--separator)]"
                >
                  <Image
                    src={photo(CATEGORY_PHOTO[key]!, 400, 500)}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 120px, 180px"
                    className="object-cover transition-transform duration-500 hover:scale-105"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-[rgba(16,10,62,0.85)] via-transparent to-transparent"
                  />
                  <span aria-hidden className="absolute inset-x-0 bottom-0 p-3 text-[length:var(--text-callout)] font-semibold text-white">
                    {cat(key)}
                  </span>
                </Link>
              </Pressable>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Featured studios: sortable results grid */}
      <section className="mt-12" aria-labelledby="results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results" className="text-[length:var(--text-title2)] font-bold tracking-tight">
            {t('resultsTitle')}
          </h2>
          <Link
            href="/search"
            locale={locale}
            className="press inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-button)] px-2 text-[length:var(--text-subhead)] font-medium text-[color:var(--tint)]"
          >
            {t('exploreAll')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-4">
          <SortControl value={sort} />
        </div>

        <Suspense key={sort} fallback={<ResultsGridSkeleton label={t('loadingResults')} />}>
          <FeaturedResults sort={sort} locale={locale} />
        </Suspense>
      </section>

      {/* How it works */}
      <section className="mt-14" aria-labelledby="how">
        <h2 id="how" className="text-[length:var(--text-title2)] font-bold tracking-tight">
          {t('howTitle')}
        </h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n, i) => (
            <Reveal as="li" key={n} delay={i * 0.08}>
              <div className="h-full rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--tint)] text-[length:var(--text-headline)] font-bold text-[color:var(--tint-contrast)]"
                >
                  {n}
                </span>
                <h3 className="mt-4 text-[length:var(--text-headline)] font-semibold">{t(`how${n}Title`)}</h3>
                <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
                  {t(`how${n}Body`)}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Trust points */}
      <section className="mt-14" aria-labelledby="trust">
        <h2 id="trust" className="text-[length:var(--text-title2)] font-bold tracking-tight">
          {t('trustTitle')}
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Reveal>
            <TrustCard
              icon={<Sparkles className="h-6 w-6" aria-hidden />}
              title={t('trustInstant')}
              body={t('trustInstantBody')}
            />
          </Reveal>
          <Reveal delay={0.08}>
            <TrustCard
              icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
              title={t('trustVerified')}
              body={t('trustVerifiedBody')}
            />
          </Reveal>
          <Reveal delay={0.16}>
            <TrustCard
              icon={<MapPin className="h-6 w-6" aria-hidden />}
              title={t('trustLocal')}
              body={t('trustLocalBody')}
            />
          </Reveal>
        </div>
      </section>

      {/* List-your-business CTA */}
      <Reveal as="section" className="relative isolate mt-14 overflow-hidden rounded-[var(--radius-sheet)] text-white">
        <Image
          src={photo('salon', 1400, 700)}
          alt=""
          fill
          sizes="(max-width: 1152px) 100vw, 1152px"
          className="-z-10 object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[rgba(16,10,62,0.82)]" />
        <div className="p-8 sm:p-12">
          <h2 className="max-w-[22ch] text-[length:var(--text-title1)] font-extrabold leading-tight tracking-tight">
            {t('ctaTitle')}
          </h2>
          <p className="mt-2 max-w-[52ch] text-white/85">{t('ctaBody')}</p>
          <Link
            href="/for-business"
            locale={locale}
            className="press mt-6 inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-button)] bg-white px-6 text-[length:var(--text-headline)] font-semibold text-[color:var(--colors--neutral--800)]"
          >
            {t('listCtaButton')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </Reveal>
    </div>
  );
}

/** Featured studios for the home grid; no text filter, the sort decides order. */
async function FeaturedResults({
  sort,
  locale,
}: {
  sort: Parameters<typeof searchBusinesses>[0]['sort'];
  locale: string;
}) {
  const s = await getTranslations('search');
  const [cards, favouriteIds] = await Promise.all([
    searchBusinesses({ sort }),
    getFavouriteIds(),
  ]);
  return (
    <>
      <ResultsGrid cards={cards} favouriteIds={favouriteIds} locale={locale} hasFilters={false} />
      {cards.length > 0 ? (
        <p className="mt-6 text-center text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
          {s('resultsCount', { count: cards.length })}
        </p>
      ) : null}
    </>
  );
}

function TrustCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="h-full rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
      <div className="text-[color:var(--tint)]">{icon}</div>
      <h3 className="mt-3 text-[length:var(--text-headline)] font-semibold">{title}</h3>
      <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
        {body}
      </p>
    </div>
  );
}
