import { Prisma } from '@prisma/client';
import { db } from './db';
import { getNextSlotIso } from './availability-cache';
import { isOpenNow } from './hours';
import { BUSINESS_TZ, localDateKey } from './time';

import type { Sort } from './catalogue';
export { CITIES, CATEGORIES, SORTS } from './catalogue';
export type { Sort } from './catalogue';

/** Relations the card query needs. Next slot is loaded separately, from a cache. */
const cardInclude = (todayKey: string) => ({
  photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
  services: { where: { active: true }, orderBy: { priceCents: 'asc' } },
  openingHours: true,
  // Closures only matter when they can still cover today; keeps the join small.
  closures: { where: { toDate: { gte: todayKey } } },
}) satisfies Prisma.BusinessInclude;

export interface SearchFilters {
  q?: string;
  cat?: string;
  city?: string;
  open?: boolean;
  minPrice?: number; // cents
  maxPrice?: number; // cents
  lang?: string;
  minRating?: number;
  sort?: Sort;
}

export interface BusinessCard {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  brandPrimary: string;
  brandAccent: string;
  ratingAvg: number;
  ratingCount: number;
  fromPriceCents: number | null;
  openNow: boolean;
  nextSlotIso: string | null;
}

/**
 * Search + filter businesses. Uses Postgres trigram similarity for typo-tolerant
 * text matching (requirement §1.1) via a raw query when `q` is present, then
 * loads the matched rows through Prisma for typed shaping. Non-text filters run
 * as a normal Prisma query.
 */
export async function searchBusinesses(filters: SearchFilters): Promise<BusinessCard[]> {
  const where: Prisma.BusinessWhereInput = {
    status: 'PUBLISHED',
    ...(filters.cat ? { category: filters.cat } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.lang ? { languages: { has: filters.lang } } : {}),
    ...(filters.minRating ? { ratingAvg: { gte: filters.minRating } } : {}),
  };

  // Text search: trigram-matched ids first (typo tolerant), then constrain.
  let idOrder: string[] | null = null;
  if (filters.q && filters.q.trim().length >= 2) {
    const q = filters.q.trim();
    const rows = await db.$queryRaw<{ id: string; score: number }[]>`
      SELECT b.id,
             GREATEST(
               similarity(b.name, ${q}),
               similarity(COALESCE(b.tagline, ''), ${q}),
               COALESCE(MAX(similarity(s.name, ${q})), 0)
             ) AS score
      FROM "Business" b
      LEFT JOIN "Service" s ON s."businessId" = b.id AND s.active = true
      WHERE b.status = 'PUBLISHED'
        AND (
          b.name % ${q}
          OR COALESCE(b.tagline, '') % ${q}
          OR s.name % ${q}
          OR b.name ILIKE ${'%' + q + '%'}
          OR s.name ILIKE ${'%' + q + '%'}
          OR to_tsvector('simple', b.name || ' ' || COALESCE(b.tagline, '') || ' ' || COALESCE(s.name, ''))
             @@ plainto_tsquery('simple', ${q})
        )
      GROUP BY b.id
      ORDER BY score DESC
      LIMIT 100
    `;
    idOrder = rows.map((r) => r.id);
    if (idOrder.length === 0) return [];
    where.id = { in: idOrder };
  }

  const businesses = await db.business.findMany({
    where,
    include: cardInclude(localDateKey(new Date(), BUSINESS_TZ)),
  });

  // Price filter is applied on the cheapest active service.
  const now = new Date();
  const cards: BusinessCard[] = [];

  for (const b of businesses) {
    const prices = b.services.map((s) => s.priceCents);
    const fromPriceCents = prices.length ? Math.min(...prices) : null;

    if (filters.minPrice != null && (fromPriceCents == null || fromPriceCents < filters.minPrice)) {
      continue;
    }
    if (filters.maxPrice != null && (fromPriceCents == null || fromPriceCents > filters.maxPrice)) {
      continue;
    }

    const openNow = isOpenNow(b.openingHours, b.closures.map((c) => ({ from: c.fromDate, to: c.toDate })), now);
    if (filters.open && !openNow) continue;

    cards.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      category: b.category,
      city: b.city,
      tagline: b.tagline,
      logoUrl: b.logoUrl,
      coverUrl: b.photos[0]?.url ?? null,
      brandPrimary: b.brandPrimary,
      brandAccent: b.brandAccent,
      ratingAvg: b.ratingAvg,
      ratingCount: b.ratingCount,
      fromPriceCents,
      openNow,
      nextSlotIso: null, // filled by attachNextSlots, from the per-business cache
    });
  }

  // Next slot comes from a per-business tagged cache (lib/availability-cache.ts),
  // so a results grid never runs the availability engine per request per card.
  const withSlots = await attachNextSlots(cards);

  return sortCards(withSlots, idOrder, filters.sort ?? 'recommended');
}

/** Attach each card's next-available slot from the per-business cache, in parallel. */
async function attachNextSlots(cards: BusinessCard[]): Promise<BusinessCard[]> {
  const slots = await Promise.all(cards.map((c) => getNextSlotIso(c.id)));
  cards.forEach((card, i) => {
    card.nextSlotIso = slots[i] ?? null;
  });
  return cards;
}

function sortCards(cards: BusinessCard[], idOrder: string[] | null, sort: Sort): BusinessCard[] {
  const copy = [...cards];
  switch (sort) {
    case 'rating':
      copy.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
      break;
    case 'price':
      copy.sort(
        (a, b) =>
          (a.fromPriceCents ?? Infinity) - (b.fromPriceCents ?? Infinity),
      );
      break;
    case 'soonest':
      copy.sort((a, b) => {
        const at = a.nextSlotIso ? Date.parse(a.nextSlotIso) : Infinity;
        const bt = b.nextSlotIso ? Date.parse(b.nextSlotIso) : Infinity;
        return at - bt;
      });
      break;
    case 'recommended':
    default:
      if (idOrder) {
        // Preserve trigram relevance order from the text search.
        const rank = new Map(idOrder.map((id, i) => [id, i]));
        copy.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      } else {
        // No query: rank by a blend of rating and having availability.
        copy.sort((a, b) => {
          const av = a.nextSlotIso ? 1 : 0;
          const bv = b.nextSlotIso ? 1 : 0;
          return bv - av || b.ratingAvg - a.ratingAvg;
        });
      }
  }
  return copy;
}
