import { getTranslations } from 'next-intl/server';

/**
 * Route-level loading state for a business page: header block plus service rows.
 * min-h-dvh keeps the footer below the fold so it does not jump when content streams in (CLS).
 */
export default async function Loading() {
  const t = await getTranslations('business');
  return (
    <div role="status" aria-busy="true" className="mx-auto min-h-dvh max-w-5xl px-4 pb-24 pt-10">
      <span className="sr-only">{t('loadingProfile')}</span>
      <div aria-hidden>
        <div className="h-40 w-full animate-pulse rounded-[var(--radius-card)] bg-[color:var(--separator)]" />
        <div className="mt-6 space-y-3">
          <div className="h-3 w-full max-w-[65ch] animate-pulse rounded bg-[color:var(--separator)]" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--separator)]" />
        </div>
        <div className="mt-8 divide-y divide-[color:var(--separator)] rounded-[var(--radius-card)] bg-[color:var(--surface)] shadow-sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="h-4 w-1/2 animate-pulse rounded bg-[color:var(--separator)]" />
              <div className="h-4 w-12 animate-pulse rounded bg-[color:var(--separator)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
