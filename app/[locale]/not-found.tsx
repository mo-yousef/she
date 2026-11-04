import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('errors');
  const c = await getTranslations('common');
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-[length:var(--text-title1)] font-bold tracking-tight">
        {t('notFound')}
      </h1>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-button)] bg-[color:var(--tint)] px-6 font-semibold text-[color:var(--tint-contrast)]"
      >
        {c('appName')}
      </Link>
    </div>
  );
}
