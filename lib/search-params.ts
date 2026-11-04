import { z } from 'zod';
import { CATEGORIES, CITIES, SORTS, type SearchFilters, type Sort } from './search';

type RawParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v && v.length ? v : undefined;
}

// Each field is validated on its own; an invalid value is dropped, never thrown,
// so a bad shared link still renders a useful page.
const fields = {
  q: z.string().trim().min(1).max(80),
  cat: z.enum(CATEGORIES),
  city: z.string().trim().min(1).max(40),
  lang: z.enum(['en', 'el', 'ru']),
  price: z.coerce.number().int().min(0).max(1_000_000),
  rating: z.coerce.number().int().min(1).max(5),
};

function pick<T>(schema: z.ZodType<T>, v: string | string[] | undefined): T | undefined {
  const r = schema.safeParse(str(v));
  return r.success ? r.data : undefined;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Typo-tolerant city match ("limasol" -> Limassol); undefined if nothing is close. */
export function resolveCity(input: string): (typeof CITIES)[number] | undefined {
  const x = input.trim().toLowerCase();
  let best: (typeof CITIES)[number] | undefined;
  let bestD = 3; // accept distance <= 2
  for (const c of CITIES) {
    const d = editDistance(x, c.toLowerCase());
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Parse URL search params into typed, validated filters (requirement §1.1). */
export function parseSearchFilters(params: RawParams): SearchFilters {
  const sortRaw = str(params.sort);
  const sort: Sort | undefined = SORTS.includes(sortRaw as Sort)
    ? (sortRaw as Sort)
    : undefined;

  return {
    q: pick(fields.q, params.q),
    cat: pick(fields.cat, params.cat),
    city: resolveCity(pick(fields.city, params.city) ?? ''),
    open: str(params.open) === '1' || str(params.open) === 'true',
    minPrice: pick(fields.price, params.minPrice),
    maxPrice: pick(fields.price, params.maxPrice),
    lang: pick(fields.lang, params.lang),
    minRating: pick(fields.rating, params.rating),
    sort,
  };
}

/** Build a query object for links, dropping empty values. */
export function filtersToQuery(filters: SearchFilters): Record<string, string> {
  const q: Record<string, string> = {};
  if (filters.q) q.q = filters.q;
  if (filters.cat) q.cat = filters.cat;
  if (filters.city) q.city = filters.city;
  if (filters.open) q.open = '1';
  if (filters.minPrice != null) q.minPrice = String(filters.minPrice);
  if (filters.maxPrice != null) q.maxPrice = String(filters.maxPrice);
  if (filters.lang) q.lang = filters.lang;
  if (filters.minRating != null) q.rating = String(filters.minRating);
  if (filters.sort) q.sort = filters.sort;
  return q;
}
