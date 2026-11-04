import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';

/**
 * Top navigation bar. This is a navigation-layer surface, so it uses the
 * translucent `.glass` material with a solid fallback (see globals.css).
 */
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations('nav');
  const c = await getTranslations('common');

  return (
    <header className="glass sticky top-0 z-40 border-b border-[color:var(--separator)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[color:var(--surface)] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          locale={locale}
          className="text-[length:var(--text-title3)] font-bold tracking-tight text-[color:var(--label)]"
        >
          {c('appName')}
        </Link>
        <nav className="flex items-center gap-1" aria-label="Primary">
          <Link
            href="/for-business"
            locale={locale}
            className="hidden rounded-[var(--radius-button)] px-3 py-2 text-[length:var(--text-subhead)] text-[color:var(--label-secondary)] hover:text-[color:var(--label)] sm:inline-flex"
          >
            {t('forBusiness')}
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
