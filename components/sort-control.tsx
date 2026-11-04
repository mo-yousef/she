'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { SORTS, type Sort } from '@/lib/search';

/**
 * Sort control (requirement §1.1). A segmented control per the Apple HIG for a
 * small set of mutually exclusive options. The chosen sort is written to the URL
 * so the result stays shareable and survives refresh; every other active query
 * parameter is preserved.
 */
const SORT_LABEL_KEYS: Record<Sort, string> = {
  recommended: 'sortRecommended',
  rating: 'sortTopRated',
  price: 'sortLowestPrice',
  soonest: 'sortSoonest',
};

export function SortControl({ value }: { value: Sort }) {
  const t = useTranslations('search');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(next: Sort) {
    if (next === value || isPending) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'recommended') {
      params.delete('sort');
    } else {
      params.set('sort', next);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { locale });
    });
  }

  return (
    <div
      role="group"
      aria-label={t('sort')}
      className="inline-flex flex-wrap gap-1 rounded-[var(--radius-button)] bg-[color:var(--surface)] p-1 shadow-sm"
    >
      {SORTS.map((sort) => {
        const selected = sort === value;
        return (
          <button
            key={sort}
            type="button"
            onClick={() => select(sort)}
            aria-pressed={selected}
            aria-disabled={isPending}
            className={`inline-flex min-h-11 items-center rounded-[calc(var(--radius-button)-4px)] px-4 text-[length:var(--text-subhead)] font-medium transition-colors aria-disabled:opacity-60 ${
              selected
                ? 'bg-[color:var(--tint)] text-[color:var(--tint-contrast)]'
                : 'text-[color:var(--label-secondary)] hover:text-[color:var(--label)]'
            }`}
          >
            {t(SORT_LABEL_KEYS[sort])}
          </button>
        );
      })}
    </div>
  );
}
