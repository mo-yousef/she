import { ImageResponse } from 'next/og';
import { ACCENT_WEIGHT, DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, checkBrand } from '@/lib/brand';
import { mixColors } from '@/lib/contrast';
import { db } from '@/lib/db';

export const alt = 'she.cy business';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';


/**
 * Dynamic OG image: brand gradient + name + city.
 * shortcut: uses the built-in ImageResponse font, which covers Latin only — Greek/
 * Cyrillic business names may render as missing glyphs. Revisit by bundling a
 * Noto Sans subset (latin+greek+cyrillic) and passing it via `fonts`.
 */
export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const b = await db.business.findUnique({
    where: { slug },
    select: { name: true, city: true, status: true, brandPrimary: true, brandAccent: true },
  });
  const published = b?.status === 'PUBLISHED';
  // Colours are interpolated into CSS: only validated colours (plain hex, white text readable,
  // see lib/brand.ts) are used, else the platform defaults. The gradient ends on the same 35%
  // accent blend the validator checks, so white text stays >= 4.5:1 across the whole image.
  const brand = published ? checkBrand(b.brandPrimary, b.brandAccent) : null;
  const c1 = brand?.ok ? brand.brandPrimary.hex! : DEFAULT_BRAND_PRIMARY;
  const c2 = mixColors(c1, brand?.ok ? brand.brandAccent.hex! : DEFAULT_BRAND_ACCENT, ACCENT_WEIGHT);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#fff',
          background: `linear-gradient(135deg, ${c1}, ${c1} 55%, ${c2})`,
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 600, opacity: 0.9 }}>she.cy</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
            {published ? b.name : 'she.cy'}
          </div>
          {published ? <div style={{ fontSize: 40, marginTop: 20, opacity: 0.9 }}>{b.city}</div> : null}
        </div>
      </div>
    ),
    size,
  );
}
