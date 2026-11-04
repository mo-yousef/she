'use client';

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

export function BusinessMapLazy({ lat, lng }: { lat: number; lng: number }) {
  const t = useTranslations('business');
  return <BusinessMap lat={lat} lng={lng} label={t('mapLabel')} />;
}
