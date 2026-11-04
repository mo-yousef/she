/**
 * Revalidate everything a public listing edit can change (req 5.1). Call from the
 * 'use server' wrappers AFTER the core succeeded (never inside a DB transaction).
 * Same approach as the review actions: path revalidation for rendered pages, plus the
 * availability tag for the cached card "next slot" (lib/next-slot.ts).
 *
 * The OG image is its own route (it reads name/city/brand from the DB), so revalidating the
 * page does not cover it. The sitemap is `force-dynamic` (app/sitemap.ts): nothing to revalidate.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { routing } from '../i18n/routing';
import { availabilityTag } from './next-slot';

/** Injectable so unit tests can assert the exact paths/tags without the Next runtime. */
export interface Revalidator {
  path: (path: string, type?: 'page' | 'layout') => void;
  tag: (tag: string) => void;
}

export const nextRevalidator: Revalidator = {
  path: (path, type) => (type ? revalidatePath(path, type) : revalidatePath(path)),
  tag: (tag) => revalidateTag(tag),
};

export function revalidateBusinessPublic(
  business: { id: string; slug: string },
  rv: Revalidator = nextRevalidator,
): void {
  for (const locale of routing.locales) {
    rv.path(`/${locale}/b/${business.slug}`);
    rv.path(`/${locale}/b/${business.slug}/opengraph-image`);
    rv.path(`/${locale}`);
    rv.path(`/${locale}/search`);
  }
  rv.tag(availabilityTag(business.id));
}
