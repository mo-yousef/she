'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { CATEGORIES, CITIES, SORTS } from '@/lib/search';
import { formatPrice } from '@/lib/money';

/**
 * Filter + sort bar. Every change is written to the URL query string so results
 * are shareable and the back button works (requirement §1.1). Uses native
 * selects and checkbox for correct mobile keyboards and accessibility.
 */
export function SearchFilters({
  current,
}: {
  current: Record<string, string>;
}) {
  const t = useTranslations('search');
  const cat = useTranslations('categories');
  const cities = useTranslations('cities');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(current.q ?? '');

  function update(next: Record<string, string | undefined>) {
    const merged: Record<string, string> = { ...current };
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') delete merged[k];
      else merged[k] = v;
    }
    startTransition(() => {
      router.replace({ pathname, query: merged }, { locale });
    });
  }

  const hasFilters = Object.keys(current).some((k) => k !== 'sort');

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy={isPending}
      role="search"
      aria-label={t('filters')}
    >
      <form
        className="flex w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: text.trim() || undefined });
        }}
      >
        <input
          type="search"
          name="q"
          inputMode="search"
          autoComplete="off"
          maxLength={80}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          className="min-h-11 flex-1 rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--label)] placeholder:text-[color:var(--label-secondary)]"
        />
        <button
          type="submit"
          className="min-h-11 rounded-[var(--radius-button)] bg-[color:var(--tint)] px-5 text-[length:var(--text-headline)] font-semibold text-[color:var(--tint-contrast)]"
        >
          {t('searchLabel')}
        </button>
      </form>
      <Select
        label={t('category')}
        value={current.cat ?? ''}
        placeholder={t('anyCategory')}
        onChange={(v) => update({ cat: v })}
        options={CATEGORIES.map((v) => ({ value: v, label: cat(v) }))}
      />
      <Select
        label={t('city')}
        value={current.city ?? ''}
        placeholder={t('anyCity')}
        onChange={(v) => update({ city: v })}
        options={CITIES.map((v) => ({ value: v, label: cities(v) }))}
      />
      <Select
        label={t('rating')}
        value={current.rating ?? ''}
        placeholder={t('anyRating')}
        onChange={(v) => update({ rating: v })}
        options={[5, 4, 3].map((n) => ({
          value: String(n),
          label: t('ratingStars', { count: n }),
        }))}
      />

      <Select
        label={t('price')}
        value={current.maxPrice ?? ''}
        placeholder={t('anyPrice')}
        onChange={(v) => update({ maxPrice: v })}
        options={[2000, 4000, 6000, 10000].map((c) => ({
          value: String(c),
          label: t('priceUpTo', { price: formatPrice(c, locale) }),
        }))}
      />
      <Select
        label={t('language')}
        value={current.lang ?? ''}
        placeholder={t('anyLanguage')}
        onChange={(v) => update({ lang: v })}
        options={[
          { value: 'en', label: t('langEn') },
          { value: 'el', label: t('langEl') },
          { value: 'ru', label: t('langRu') },
        ]}
      />

      <label className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[length:var(--text-subhead)]">
        <input
          type="checkbox"
          checked={current.open === '1'}
          onChange={(e) => update({ open: e.target.checked ? '1' : undefined })}
          className="h-4 w-4 accent-[color:var(--tint)]"
        />
        {t('openNow')}
      </label>

      <div className="ml-auto flex items-center gap-2">
        <Select
          label={t('sort')}
          value={current.sort ?? 'recommended'}
          onChange={(v) => update({ sort: v })}
          options={SORTS.map((s) => ({
            value: s,
            label: t(
              s === 'recommended'
                ? 'sortRecommended'
                : s === 'rating'
                  ? 'sortTopRated'
                  : s === 'price'
                    ? 'sortLowestPrice'
                    : 'sortSoonest',
            ),
          }))}
        />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setText('');
              update({ cat: undefined, city: undefined, rating: undefined, open: undefined, q: undefined, minPrice: undefined, maxPrice: undefined, lang: undefined });
            }}
            className="min-h-11 rounded-[var(--radius-button)] px-3 text-[length:var(--text-subhead)] text-[color:var(--tint)] underline"
          >
            {t('clearFilters')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  placeholder,
  onChange,
  options,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[length:var(--text-subhead)]">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-[var(--radius-input)] border border-[color:var(--control-border)] bg-[color:var(--surface)] px-3 text-[color:var(--label)]"
      >
        {placeholder != null ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
