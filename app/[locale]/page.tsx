import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Sparkles, ShieldCheck, MapPin, ArrowRight } from 'lucide-react';
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
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10">
      {/* Hero — the single entrance animation in the product lives here. */}
      <section className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm sm:p-10">
        <h1 className="max-w-[18ch] text-[length:var(--text-large-title)] font-bold leading-[var(--text-large-title--line-height)] tracking-tight">
          {t('heroTitle')}
        </h1>
        <p className="mt-3 max-w-[60ch] text-[length:var(--text-body)] text-[color:var(--label-secondary)]">
          {t('heroSubtitle')}
        </p>

        <form
          action={`/${locale}/search`}
          className="mt-6 flex flex-col gap-3 sm:flex-row"
        >
          <input
            name="q"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-12 flex-1 rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--bg)] px-4 text-[length:var(--text-body)] text-[color:var(--label)] placeholder:text-[color:var(--label-secondary)]"
          />
          <input
            name="city"
            type="text"
            autoComplete="off"
            placeholder={t('cityPlaceholder')}
            aria-label={t('cityPlaceholder')}
            className="h-12 rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--bg)] px-4 text-[length:var(--text-body)] text-[color:var(--label)] placeholder:text-[color:var(--label-secondary)] sm:w-48"
          />
          <button
            type="submit"
            className="h-12 rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 text-[length:var(--text-headline)] font-semibold text-[color:var(--tint-contrast)]"
          >
            {c('search')}
          </button>
        </form>
      </section>

      {/* Categories */}
      <section className="mt-10" aria-labelledby="cats">
        <h2
          id="cats"
          className="text-[length:var(--text-title3)] font-semibold tracking-tight"
        >
          {t('categories')}
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {categories.map((key) => (
            <li key={key}>
              <Link
                href={{ pathname: '/search', query: { cat: key } }}
                locale={locale}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] border border-[color:var(--separator)] bg-[color:var(--surface)] px-4 text-[length:var(--text-callout)] text-[color:var(--label)] transition-transform hover:-translate-y-0.5"
              >
                {cat(key)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Featured studios — sortable results grid */}
      <section className="mt-12" aria-labelledby="results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="results"
            className="text-[length:var(--text-title3)] font-semibold tracking-tight"
          >
            {t('resultsTitle')}
          </h2>
          <Link
            href="/search"
            locale={locale}
            className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-button)] px-2 text-[length:var(--text-subhead)] font-medium text-[color:var(--tint)]"
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

      {/* Trust points */}
      <section className="mt-12" aria-labelledby="trust">
        <h2
          id="trust"
          className="text-[length:var(--text-title3)] font-semibold tracking-tight"
        >
          {t('trustTitle')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <TrustCard
            icon={<Sparkles className="h-6 w-6" aria-hidden />}
            title={t('trustInstant')}
            body={t('trustInstantBody')}
          />
          <TrustCard
            icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
            title={t('trustVerified')}
            body={t('trustVerifiedBody')}
          />
          <TrustCard
            icon={<MapPin className="h-6 w-6" aria-hidden />}
            title={t('trustLocal')}
            body={t('trustLocalBody')}
          />
        </div>
      </section>

      {/* List-your-business CTA */}
      <section className="mt-12 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-6 shadow-sm sm:p-8">
        <p className="text-[length:var(--text-title3)] font-semibold tracking-tight">
          {t('listCta')}
        </p>
        <Link
          href="/for-business"
          locale={locale}
          className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 text-[length:var(--text-headline)] font-semibold text-[color:var(--tint-contrast)]"
        >
          {t('listCtaButton')}
        </Link>
      </section>
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
    <div className="rounded-[var(--radius-card)] bg-[color:var(--surface)] p-5 shadow-sm">
      <div className="text-[color:var(--tint)]">{icon}</div>
      <h3 className="mt-3 text-[length:var(--text-headline)] font-semibold">{title}</h3>
      <p className="mt-1 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
        {body}
      </p>
    </div>
  );
}
