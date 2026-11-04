'use client';

/**
 * Owner dashboard navigation. Desktop: grouped sidebar. Mobile: an app-style bottom tab bar with
 * the four daily destinations plus a "More" sheet for the rest, so the page content keeps the screen.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarDays,
  Clock,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  Scissors,
  Settings,
  Star,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { EASE } from './motion/reveal';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
}

const OVERVIEW: NavItem = { href: '/dashboard', icon: LayoutDashboard, labelKey: 'overview' };
const CALENDAR: NavItem = { href: '/dashboard/calendar', icon: CalendarDays, labelKey: 'calendar' };
const BOOKINGS: NavItem = { href: '/dashboard/bookings', icon: ListChecks, labelKey: 'bookings' };
const SERVICES: NavItem = { href: '/dashboard/services', icon: Scissors, labelKey: 'services' };
const TEAM: NavItem = { href: '/dashboard/team', icon: Users, labelKey: 'team' };
const HOURS: NavItem = { href: '/dashboard/hours', icon: Clock, labelKey: 'hours' };
const PROFILE: NavItem = { href: '/dashboard/profile', icon: Store, labelKey: 'profile' };
const REVIEWS: NavItem = { href: '/dashboard/reviews', icon: Star, labelKey: 'reviews' };
const SETTINGS: NavItem = { href: '/dashboard/settings', icon: Settings, labelKey: 'settings' };

/** Sidebar groups (desktop). */
export const DASHBOARD_GROUPS: { labelKey: string; items: NavItem[] }[] = [
  { labelKey: 'groupDaily', items: [OVERVIEW, CALENDAR, BOOKINGS] },
  { labelKey: 'groupCatalogue', items: [SERVICES, TEAM, HOURS] },
  { labelKey: 'groupBusiness', items: [PROFILE, REVIEWS, SETTINGS] },
];
export const DASHBOARD_NAV: NavItem[] = DASHBOARD_GROUPS.flatMap((g) => g.items);

const TABS: NavItem[] = [OVERVIEW, CALENDAR, BOOKINGS];
const MORE: NavItem[] = [SERVICES, TEAM, HOURS, PROFILE, REVIEWS, SETTINGS];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
}

export function DashboardNav({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.nav');
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((i) => isActive(pathname, i.href));

  // Close the sheet after navigating.
  useEffect(() => {
    sheet.current?.close();
  }, [pathname]);

  return (
    <nav aria-label={t('label')}>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        {DASHBOARD_GROUPS.map((g) => (
          <div key={g.labelKey} className="mb-5">
            <p className="mb-1 px-3 text-[length:var(--text-caption)] font-semibold uppercase tracking-wider text-[color:var(--label-secondary)]">
              {t(g.labelKey)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      locale={locale}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-button)] px-3 text-[length:var(--text-callout)] font-medium transition-colors ${active
                          ? 'bg-[color:var(--tint)] text-[color:var(--tint-contrast)] shadow-sm'
                          : 'text-[color:var(--label)] hover:bg-[color:var(--separator)]'
                        }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Mobile bottom tab bar */}
      <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--separator)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  locale={locale}
                  aria-current={active ? 'page' : undefined}
                  className={`press relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[length:var(--text-caption)] font-medium ${active ? 'text-[color:var(--tint)]' : 'text-[color:var(--label-secondary)]'
                    }`}
                >
                  {active ? (
                    <motion.span
                      layoutId="dash-tab"
                      aria-hidden
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-[color:var(--tint)]"
                      transition={{ duration: 0.3, ease: EASE }}
                    />
                  ) : null}
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => sheet.current?.showModal()}
              className={`press relative flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 text-[length:var(--text-caption)] font-medium ${moreActive ? 'text-[color:var(--tint)]' : 'text-[color:var(--label-secondary)]'
                }`}
            >
              {moreActive ? (
                <motion.span
                  layoutId="dash-tab"
                  aria-hidden
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-[color:var(--tint)]"
                  transition={{ duration: 0.3, ease: EASE }}
                />
              ) : null}
              <MoreHorizontal className="h-6 w-6" strokeWidth={moreActive ? 2.4 : 1.8} aria-hidden />
              {t('more')}
            </button>
          </li>
        </ul>
      </div>

      <dialog
        ref={sheet}
        aria-labelledby="dash-more-title"
        onClose={() => setMoreOpen(false)}
        onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDialogElement).open)}
        onClick={(e) => {
          if (e.target === e.currentTarget) sheet.current?.close();
        }}
        className="sheet-up m-0 mt-auto w-full max-w-none rounded-t-[var(--radius-sheet)] border-0 bg-[color:var(--surface)] p-0 pb-[env(safe-area-inset-bottom)] text-[color:var(--label)] shadow-xl backdrop:bg-black/40 lg:hidden"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[color:var(--separator)]" aria-hidden />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 id="dash-more-title" className="text-[length:var(--text-title3)] font-bold">
            {t('more')}
          </h2>
          <button
            type="button"
            onClick={() => sheet.current?.close()}
            aria-label={t('close')}
            className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-[color:var(--separator)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ul className="grid grid-cols-3 gap-2 px-4 pb-5">
          {MORE.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  locale={locale}
                  aria-current={active ? 'page' : undefined}
                  className={`press flex min-h-24 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] px-2 text-center text-[length:var(--text-subhead)] font-medium ${active
                      ? 'bg-[color:var(--tint)] text-[color:var(--tint-contrast)]'
                      : 'bg-[color:var(--bg)] text-[color:var(--label)]'
                    }`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                  <span className="break-words">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </dialog>
    </nav>
  );
}
