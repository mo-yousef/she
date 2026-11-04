import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LEGAL_PAGES } from '@/lib/legal';

/** Minimal footer: the three legal pages (req 8, 9). */
export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations('legal');
  return (
    <footer className="border-t border-[color:var(--separator)] px-4 py-6 pb-24 md:pb-6">
      <nav aria-label={t('footerLabel')} className="mx-auto flex max-w-5xl flex-wrap gap-x-6">
        {LEGAL_PAGES.map((p) => (
          <Link
            key={p}
            href={`/legal/${p}`}
            locale={locale}
            className="inline-flex min-h-11 items-center text-[length:var(--text-footnote)] text-[color:var(--label-secondary)] hover:underline"
          >
            {t(p)}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
