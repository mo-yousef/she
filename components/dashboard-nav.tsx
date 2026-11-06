'use client';

/**
 * Data-driven dashboard nav (task 6.1). One array; 6.2-6.8 add an item each as their
 * route lands — no component changes needed. Desktop: sidebar. Mobile: a wrapping grid.
 */
import { BookOpen, CalendarDays, Clock, LayoutDashboard, Scissors, Settings, Star, Store, Users } from 'lucide-react';
import { usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
}

/**
 * Only routes that exist are listed. Each later task appends one line here (icons from
 * lucide-react): 6.2 Calendar, 6.3 BookOpen "bookings", 6.4 Scissors "services",
 * 6.5 Users "team", 6.6 Clock "hours", 6.7 Image "profile", 6.8 Star "reviews" + Settings.
 */
export const DASHBOARD_NAV: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'overview' },
  { href: '/dashboard/calendar', icon: CalendarDays, labelKey: 'calendar' },
  { href: '/dashboard/bookings', icon: BookOpen, labelKey: 'bookings' },
  { href: '/dashboard/services', icon: Scissors, labelKey: 'services' },
  { href: '/dashboard/team', icon: Users, labelKey: 'team' },
  { href: '/dashboard/hours', icon: Clock, labelKey: 'hours' },
  { href: '/dashboard/profile', icon: Store, labelKey: 'profile' },
  { href: '/dashboard/reviews', icon: Star, labelKey: 'reviews' },
  { href: '/dashboard/settings', icon: Settings, labelKey: 'settings' },
];

export function DashboardNav({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')}>
      {/* Desktop sidebar */}
      <ul className="hidden flex-col gap-1 lg:flex">
        {DASHBOARD_NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                locale={locale}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Mobile: every destination visible at once (3 columns at 360px, 5 from sm). A scrolling
          row hid most of the 9 entries with no cue (design audit 6.11). Icon above label so
          long el/ru labels wrap instead of clipping. */}
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:hidden">
        {DASHBOARD_NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                locale={locale}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 break-words rounded-md px-1 py-1 text-center text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
