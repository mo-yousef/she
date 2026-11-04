/**
 * SEO helpers (requirement 2.1): absolute URLs, hreflang alternates and the
 * schema.org JSON-LD builder. Pure — no DB or Next imports — so it is unit-testable.
 */
import { routing } from '../i18n/routing';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Site origin without a trailing slash. Falls back to localhost for dev/CI. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Absolute URL for a locale-prefixed path, e.g. ('el', '/b/foo'). */
export function localizedUrl(locale: string, path = ''): string {
  return `${siteUrl()}/${locale}${path === '/' ? '' : path}`;
}

/** hreflang map for a path: en/el/ru plus x-default pointing at the default locale. */
export function languageAlternates(path = ''): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of routing.locales) map[l] = localizedUrl(l, path);
  map['x-default'] = localizedUrl(routing.defaultLocale, path);
  return map;
}

/** Minutes from midnight -> 'HH:MM' (24:00 is clamped to 23:59 for schema.org). */
export function minutesToHHMM(min: number): string {
  const m = Math.min(Math.max(0, Math.round(min)), 24 * 60 - 1);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Most specific schema.org LocalBusiness subtype for our categories. */
export function schemaTypeForCategory(category: string): string {
  if (category === 'hair' || category === 'blowdry') return 'HairSalon';
  if (category === 'nails') return 'NailSalon';
  return 'BeautySalon';
}

export interface BusinessJsonLdInput {
  slug: string;
  name: string;
  category: string;
  city: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  imageUrl?: string | null;
  ratingAvg: number;
  ratingCount: number;
  openingHours: { weekday: number; opensMin: number; closesMin: number; closed: boolean }[];
}

/** Build the LocalBusiness JSON-LD object. Only public business contact data. */
export function buildBusinessJsonLd(
  b: BusinessJsonLdInput,
  locale: string,
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaTypeForCategory(b.category),
    name: b.name,
    url: localizedUrl(locale, `/b/${b.slug}`),
    address: {
      '@type': 'PostalAddress',
      ...(b.address ? { streetAddress: b.address } : {}),
      addressLocality: b.city,
      addressCountry: 'CY',
    },
  };
  if (b.imageUrl) ld.image = b.imageUrl;
  if (b.phone) ld.telephone = b.phone;
  if (b.lat != null && b.lng != null) {
    ld.geo = { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng };
  }
  const hours = b.openingHours
    .filter((h) => !h.closed && h.closesMin > h.opensMin)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_NAMES[h.weekday],
      opens: minutesToHHMM(h.opensMin),
      closes: minutesToHHMM(h.closesMin),
    }));
  if (hours.length) ld.openingHoursSpecification = hours;
  if (b.ratingCount > 0) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(b.ratingAvg.toFixed(1)),
      reviewCount: b.ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return ld;
}

/** Serialise for an inline <script>: escape `<` so business text cannot close the tag. */
export function serializeJsonLd(ld: Record<string, unknown>): string {
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}
