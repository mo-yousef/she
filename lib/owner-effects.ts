/**
 * One place that says what an owner edit must revalidate (req 5.1). Wrappers call this AFTER
 * the core returned ok (never inside a transaction) instead of hand-listing paths.
 *
 *  - 'public'       public page (all locales), its OG image, home, search, availability tag
 *  - 'availability' only the cached "next slot" tag (booking-level changes: the public page
 *                   does not render per-booking data)
 *  - dashboard surfaces: the dashboard page that shows that data
 *  - 'overview'     the dashboard layout (publish checklist, status badge)
 */
import {
  nextRevalidator,
  revalidateBusinessPublic,
  type Revalidator,
} from './revalidate-public';
import { availabilityTag } from './next-slot';

export type Surface =
  | 'public'
  | 'availability'
  | 'calendar'
  | 'bookings'
  | 'services'
  | 'team'
  | 'hours'
  | 'profile'
  | 'reviews'
  | 'settings'
  | 'overview';

const DASHBOARD_PAGE: Partial<Record<Surface, string>> = {
  calendar: 'calendar',
  bookings: 'bookings',
  services: 'services',
  team: 'team',
  hours: 'hours',
  profile: 'profile',
  reviews: 'reviews',
  settings: 'settings',
};

export function revalidateAfterOwnerEdit(
  opts: { business: { id: string; slug: string }; surfaces: readonly Surface[] },
  rv: Revalidator = nextRevalidator,
): void {
  const { business, surfaces } = opts;
  if (surfaces.includes('public')) revalidateBusinessPublic(business, rv);
  else if (surfaces.includes('availability')) rv.tag(availabilityTag(business.id));
  for (const s of surfaces) {
    const page = DASHBOARD_PAGE[s];
    if (page) rv.path(`/[locale]/dashboard/${page}`, 'page');
  }
  if (surfaces.includes('overview')) rv.path('/[locale]/dashboard', 'layout');
}
