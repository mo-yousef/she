import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { BusinessCard as BusinessCardData } from '@/lib/search';
import { BusinessCard, BusinessCardSkeleton } from './business-card';

/** Results grid with a clear empty state that offers the next action. */
export async function ResultsGrid({
  cards,
  favouriteIds,
  locale,
  hasFilters,
}: {
  cards: BusinessCardData[];
  favouriteIds: Set<string>;
  locale: string;
  /** True when any filter, query or sort is applied (drives which empty state shows). */
  hasFilters: boolean;
}) {
  const t = await getTranslations('search');

  if (cards.length === 0) {
    // Filtered: offer to clear. Unfiltered: nothing to clear, so point owners to listing.
    const title = hasFilters ? t('emptyTitle') : t('noStudiosTitle');
    const body = hasFilters ? t('emptyBody') : t('noStudiosBody');
    const nav = hasFilters ? null : await getTranslations('nav');
    return (
      <div className="mt-8 rounded-[var(--radius-card)] bg-[color:var(--surface)] p-10 text-center shadow-sm">
        <p className="text-[length:var(--text-headline)] font-semibold">{title}</p>
        <p className="mt-1 text-[color:var(--label-secondary)]">{body}</p>
        <Link
          href={hasFilters ? '/search' : '/for-business'}
          locale={locale}
          className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 font-semibold text-[color:var(--tint-contrast)]"
        >
          {hasFilters ? t('clearFilters') : nav!('forBusiness')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <BusinessCard
          key={card.id}
          card={card}
          locale={locale}
          favourited={favouriteIds.has(card.id)}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton cards. `label` is announced to screen readers; the visual placeholders
 * are hidden from them. Pulse is neutralised by the global prefers-reduced-motion rule.
 */
export function ResultsGridSkeleton({ count = 6, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" className="mt-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <BusinessCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
