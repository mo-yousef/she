import { ImageResponse } from 'next/og';
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
    select: { name: true, city: true, status: true },
  });
  const published = b?.status === 'PUBLISHED';
  // Every business shares the platform colours (no per-business branding).
  const c1 = '#100a3e';
  const c2 = '#1d36b6';
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
          background: `linear-gradient(135deg, ${c1}, ${c1} 40%, ${c2})`,
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
