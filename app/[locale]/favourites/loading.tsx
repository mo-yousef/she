import { getTranslations } from 'next-intl/server';
import { ResultsGridSkeleton } from '@/components/results-grid';

/** Route-level loading state shown while /favourites resolves the session and list. */
export default async function Loading() {
  const t = await getTranslations('favourites');
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</h1>
      <ResultsGridSkeleton count={3} label={t('loadingFavourites')} />
    </div>
  );
}
