'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

/**
 * Client-side lazy wrapper: `ssr: false` is only allowed in client components,
 * and keeps Leaflet out of the server render and the initial bundle.
 */
function MapPlaceholder() {
  const t = useTranslations('business');
  return (
    <div
      role="status"
      className="flex aspect-[4/3] items-center justify-center rounded-[var(--radius-input)] bg-[color:var(--bg)] text-[length:var(--text-footnote)] text-[color:var(--label-secondary)]"
    >
      {t('mapLoading')}
    </div>
  );
}

const BusinessMap = dynamic(() => import('./business-map'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

/**
 * The Leaflet chunk is only requested once the placeholder is within 300px of the
 * viewport, so it never competes with LCP on first paint.
 */
export function BusinessMapLazy({ lat, lng }: { lat: number; lng: number }) {
  const t = useTranslations('business');
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref}>
      {near ? <BusinessMap lat={lat} lng={lng} label={t('mapLabel')} /> : <MapPlaceholder />}
    </div>
  );
}
