'use client';

import { motion } from 'motion/react';
import { Compass, Heart, Search, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { EASE } from './motion/reveal';

/** Pages that bring their own bottom bar or a full-screen flow: no tab bar there. */
const HIDDEN_ON = ['/b/', '/dashboard', '/admin', '/onboarding'];

/**
 * Mobile bottom tab bar (navigation layer, `.glass`). Four top-level destinations, 44px+ targets,
 * safe-area aware, with a shared-layout indicator that glides between tabs. Desktop uses the header.
 */
export function TabBar({ locale }: { locale: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const tabs = [
    { href: '/', label: t('explore'), icon: Compass, active: pathname === '/' },
    { href: '/search', label: t('search'), icon: Search, active: pathname.startsWith('/search') },
    { href: '/favourites', label: t('saved'), icon: Heart, active: pathname.startsWith('/favourites') },
    { href: '/account', label: t('account'), icon: UserRound, active: pathname.startsWith('/account') },
  ] as const;

  return (
    <nav
      aria-label={t('tabs')}
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--separator)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              locale={locale}
              aria-current={active ? 'page' : undefined}
              className={`press relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[length:var(--text-caption)] font-medium transition-colors ${
                active ? 'text-[color:var(--tint)]' : 'text-[color:var(--label-secondary)]'
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="tab-indicator"
                  aria-hidden
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-[color:var(--tint)]"
                  transition={{ duration: 0.3, ease: EASE }}
                />
              ) : null}
              <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
