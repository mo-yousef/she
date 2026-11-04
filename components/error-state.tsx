'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { captureError } from '@/lib/monitoring';

/**
 * Shared body of the route error boundaries. Shows nothing from the error itself
 * (no message, no stack, no digest): what happened and what to do only.
 */
export function ErrorState({
  error,
  reset,
  area,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  area: string;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    captureError(error, { area, digest: error.digest });
  }, [error, area]);
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('boundaryTitle')}</h1>
      <p className="mt-3 text-[color:var(--label-secondary)]">{t('boundaryBody')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 font-semibold text-[color:var(--tint-contrast)]"
        >
          {t('tryAgain')}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-button)] px-6 font-semibold text-[color:var(--tint)] underline-offset-2 hover:underline"
        >
          {t('backHome')}
        </Link>
      </div>
    </div>
  );
}
