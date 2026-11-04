import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function BusinessNotFound() {
  const t = await getTranslations('errors');
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('studioUnavailableTitle')}</h1>
      <p className="mt-3 text-[color:var(--label-secondary)]">{t('studioUnavailableBody')}</p>
      <Link
        href="/search"
        className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 font-semibold text-[color:var(--tint-contrast)]"
      >
        {t('browseStudios')}
      </Link>
    </div>
  );
}
