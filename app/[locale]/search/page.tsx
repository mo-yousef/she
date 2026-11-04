import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { searchBusinesses } from '@/lib/search';
import { getFavouriteIds } from '@/lib/favourites';
import { parseSearchFilters, filtersToQuery } from '@/lib/search-params';
import { SearchFilters } from '@/components/search-filters';
import { ResultsGrid, ResultsGridSkeleton } from '@/components/results-grid';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('search');

  const filters = parseSearchFilters(sp);
  const currentQuery = filtersToQuery(filters);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">
        {t('resultsHeading')}
      </h1>

      <div className="mt-5">
        <SearchFilters current={currentQuery} />
      </div>

      {/* Suspense key forces the skeleton to show while a new query resolves. */}
      <Suspense key={JSON.stringify(currentQuery)} fallback={<ResultsGridSkeleton label={t('loadingResults')} />}>
        <Results locale={locale} filters={filters} />
      </Suspense>
    </div>
  );
}

async function Results({
  locale,
  filters,
}: {
  locale: string;
  filters: ReturnType<typeof parseSearchFilters>;
}) {
  const t = await getTranslations('search');
  const [cards, favouriteIds] = await Promise.all([
    searchBusinesses(filters),
    getFavouriteIds(),
  ]);

  return (
    <>
      <p className="mt-4 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
        {t('resultsCount', { count: cards.length })}
      </p>
      <ResultsGrid
        cards={cards}
        favouriteIds={favouriteIds}
        locale={locale}
        hasFilters={Object.keys(filtersToQuery(filters)).length > 0}
      />
    </>
  );
}
