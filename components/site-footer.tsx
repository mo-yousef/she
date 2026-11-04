import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LEGAL_PAGES } from '@/lib/legal';
import { LocaleSwitcher } from './locale-switcher';

const linkClass =
  'inline-flex min-h-11 items-center text-[length:var(--text-subhead)] text-[color:var(--label-secondary)] transition-colors hover:text-[color:var(--label)]';

/** Footer: brand, discovery + business links, legal pages (req 8, 9), language and copyright. */
export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations('legal');
  const f = await getTranslations('footer');
  const c = await getTranslations('common');
  const cat = await getTranslations('categories');
  const year = new Date().getFullYear();
  const categories = ['nails', 'lashes', 'hair', 'makeup', 'facials'] as const;

  return (
    <footer className="mt-12 border-t border-[color:var(--separator)] bg-[color:var(--surface)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-10 md:pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.6fr_1fr_1fr]">
        <div>
          <p className="text-[length:var(--text-title2)] font-extrabold tracking-tight">
            {c('appName')}
            <span aria-hidden className="text-[color:var(--tint)]">
              .
            </span>
          </p>
          <p className="mt-2 max-w-[28ch] text-[length:var(--text-subhead)] text-[color:var(--label-secondary)]">
            {f('tagline')}
          </p>
        </div>

        <nav aria-labelledby="footer-discover">
          <h2 id="footer-discover" className="text-[length:var(--text-subhead)] font-semibold">
            {f('discover')}
          </h2>
          <ul className="mt-1 lg:columns-2 lg:gap-6">
            <li>
              <Link href="/search" locale={locale} className={linkClass}>
                {f('allStudios')}
              </Link>
            </li>
            {categories.map((key) => (
              <li key={key}>
                <Link href={{ pathname: '/search', query: { cat: key } }} locale={locale} className={linkClass}>
                  {cat(key)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/favourites" locale={locale} className={linkClass}>
                {f('saved')}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-business">
          <h2 id="footer-business" className="text-[length:var(--text-subhead)] font-semibold">
            {f('forBusiness')}
          </h2>
          <ul className="mt-1">
            <li>
              <Link href="/for-business" locale={locale} className={linkClass}>
                {f('listBusiness')}
              </Link>
            </li>
            <li>
              <Link href="/dashboard" locale={locale} className={linkClass}>
                {f('dashboard')}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label={t('footerLabel')}>
          <h2 className="text-[length:var(--text-subhead)] font-semibold">{f('legal')}</h2>
          <ul className="mt-1">
            {LEGAL_PAGES.map((p) => (
              <li key={p}>
                <Link href={`/legal/${p}`} locale={locale} className={linkClass}>
                  {t(p)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-[color:var(--separator)] px-4 pt-6">
        <p className="text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]">
          {f('rights', { year })} · {f('madeIn')}
        </p>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
