/**
 * Curated Unsplash photos (host already allowed in next.config.ts) used for the home page
 * and for seed/demo business galleries. Real businesses upload their own via Cloudinary.
 */
const u = (id: string, w = 1200, h?: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70&w=${w}${h ? `&h=${h}` : ''}`;

const IDS = {
  hair: '1522337360788-8b13dee7a37e',
  nails: '1604654894610-df63bc536371',
  salon: '1560066984-138dadb4c035',
  lashes: '1487412947147-5cebf100ffc2',
  makeup: '1516975080664-ed2fc6a32937',
  nailsArt: '1519014816548-bf5fe059798b',
  facials: '1570172619644-dfd03ed5d881',
  flatlay: '1596462502278-27bfdc403348',
} as const;

export type PhotoKey = keyof typeof IDS;

export const photo = (key: PhotoKey, w = 1200, h?: number) => u(IDS[key], w, h);

/** Category slug (lib/catalogue.ts) -> home tile photo. */
export const CATEGORY_PHOTO: Record<string, PhotoKey> = {
  nails: 'nails',
  lashes: 'lashes',
  hair: 'hair',
  makeup: 'makeup',
  facials: 'facials',
  blowdry: 'salon',
};

/** Four gallery photos for a seed business: its own category first, then supporting shots. */
export function galleryFor(category: string): string[] {
  const main = CATEGORY_PHOTO[category] ?? 'salon';
  const rest = (['salon', 'flatlay', 'nailsArt', 'hair', 'makeup'] as PhotoKey[]).filter((k) => k !== main);
  return [main, ...rest.slice(0, 3)].map((k) => photo(k));
}
