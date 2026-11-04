import { getTranslations } from 'next-intl/server';
import { ResultsGridSkeleton } from '@/components/results-grid';

/** Route-level loading state shown while /search navigates in. */
export default async function Loading() {
  const t = await getTranslations('search');
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">
        {t('resultsHeading')}
      </h1>
      <ResultsGridSkeleton label={t('loadingResults')} />
    </div>
  );
}
