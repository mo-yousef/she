'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { EASE } from './motion/reveal';

type SessionUser = { name?: string | null; email?: string | null; role?: string } | null;

/**
 * Top navigation bar (navigation layer, so it uses the `.glass` material).
 * Dynamic behaviour: it tucks away when scrolling down and returns on scroll up (never while
 * something inside it has focus), gains a hairline + shadow once the page has scrolled, marks
 * the current section, and shows the signed-in state (fetched client-side so pages stay static).
 */
export function SiteHeader({ locale }: { locale: string }) {
  const t = useTranslations('nav');
  const c = useTranslations('common');
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<SessionUser>(null);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 8);
    if (reduce) return;
    if (y > prev && y > 96) setHidden(true);
    else if (y < prev) setHidden(false);
  });

  useEffect(() => {
    let live = true;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => live && setUser(s?.user ?? null))
      .catch(() => { });
    return () => {
      live = false;
    };
  }, [pathname]);

  const isOwner = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const links = [
    { href: '/', label: t('explore'), match: (p: string) => p === '/' },
    { href: '/search', label: t('search'), match: (p: string) => p.startsWith('/search') },
    { href: '/favourites', label: t('saved'), match: (p: string) => p.startsWith('/favourites') },
  ] as const;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <motion.header
      animate={{ y: hidden ? '-100%' : 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      onFocusCapture={() => setHidden(false)}
      className={`glass sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] transition-shadow duration-300 ${scrolled ? 'border-[color:var(--separator)] shadow-[0_1px_12px_rgba(16,10,62,0.08)]' : 'border-transparent'
        }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[color:var(--surface)] focus:px-3 focus:py-2"
      >
        {t('skipToContent')}
      </a>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            locale={locale}
            className="press text-[length:var(--text-title3)] font-extrabold tracking-tight text-[color:var(--label)]"
          >
            {c('appName')}
            <span aria-hidden className="text-[color:var(--tint)]">
              .
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label={t('primary')}>
            {links.map((l) => {
              const active = l.match(pathname);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  locale={locale}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex min-h-11 items-center rounded-[var(--radius-button)] px-3 text-[length:var(--text-subhead)] font-medium transition-colors ${active ? 'text-[color:var(--label)]' : 'text-[color:var(--label-secondary)] hover:text-[color:var(--label)]'
                    }`}
                >
                  {l.label}
                  {active ? (
                    <motion.span
                      layoutId="nav-underline"
                      aria-hidden
                      className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-[color:var(--tint)]"
                      transition={{ duration: 0.3, ease: EASE }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={isOwner ? '/dashboard' : '/for-business'}
            locale={locale}
            className="press hidden min-h-11 items-center rounded-[var(--radius-button)] px-3 text-[length:var(--text-subhead)] font-medium text-[color:var(--label-secondary)] hover:text-[color:var(--label)] lg:inline-flex"
          >
            {isOwner ? t('dashboard') : t('forBusiness')}
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
          <Link
            href="/account"
            locale={locale}
            aria-label={user ? t('account') : t('signIn')}
            className="press ml-1 inline-flex h-11 min-w-11 items-center justify-center rounded-full"
          >
            {user ? (
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--tint)] text-[length:var(--text-subhead)] font-semibold text-[color:var(--tint-contrast)]"
              >
                {initial}
              </span>
            ) : (
              <span className="hidden items-center gap-2 rounded-full bg-[color:var(--tint)] px-4 py-2 text-[length:var(--text-subhead)] font-semibold text-[color:var(--tint-contrast)] md:inline-flex">
                {t('signIn')}
              </span>
            )}
            {!user ? <UserRound className="h-5 w-5 md:hidden" aria-hidden /> : null}
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
