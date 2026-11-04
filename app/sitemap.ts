import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { routing } from '@/i18n/routing';
import { LEGAL_PAGES } from '@/lib/legal';
import { languageAlternates, localizedUrl } from '@/lib/seo';

// Built per request/ISR window; needs the DB, so don't prerender at build time.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const businesses = await db.business.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, createdAt: true },
  });

  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      lastModified,
      alternates: { languages: languageAlternates(path) },
    }));

  return [
    ...entry('/'),
    ...entry('/search'),
    ...LEGAL_PAGES.flatMap((p) => entry(`/legal/${p}`)),
    // shortcut: Business has no updatedAt column yet, so createdAt is used for lastModified.
    ...businesses.flatMap((b) => entry(`/b/${b.slug}`, b.createdAt)),
  ];
}
